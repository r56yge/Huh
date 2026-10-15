import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { CodeChallengeMethod } from "google-auth-library";

import {
  db,
  googleAccountsTable,
} from "@workspace/db";
import { GetGoogleSessionResponse } from "@workspace/api-zod";

import { requireGoogleAccount } from "../middlewares/google-account";
import {
  createGoogleOAuthClient,
  decryptOAuthTokens,
  encryptOAuthTokens,
  getGoogleRedirectUri,
  getGoogleScopes,
  loadGoogleAccount,
} from "../lib/google";

const router: IRouter = Router();
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function appRedirect(res: Response, state: string): void {
  const sameOriginPath = `/?auth=${encodeURIComponent(state)}`;
  if (process.env.APP_ORIGIN) {
    try {
      const url = new URL(sameOriginPath, process.env.APP_ORIGIN);
      res.redirect(url.toString());
      return;
    } catch {
      // An invalid optional origin should not send OAuth users to another host.
    }
  }
  res.redirect(sameOriginPath);
}

function queryValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeStateMatches(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

router.get("/auth/google", googleAuthLimiter, async (req, res): Promise<void> => {
  try {
    const oauth = createGoogleOAuthClient(getGoogleRedirectUri(req));
    const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
    const state = randomBytes(32).toString("base64url");
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    const authUrl = oauth.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: getGoogleScopes(),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    res.redirect(authUrl);
  } catch (error) {
    req.log.error({ error }, "Could not start Google OAuth");
    appRedirect(res, "unconfigured");
  }
});

router.get("/auth/google/callback", googleAuthLimiter, async (req, res): Promise<void> => {
  const code = queryValue(req.query.code);
  const state = queryValue(req.query.state);
  const oauthState = req.session.oauthState;
  const codeVerifier = req.session.oauthCodeVerifier;
  delete req.session.oauthState;
  delete req.session.oauthCodeVerifier;

  if (queryValue(req.query.error)) {
    appRedirect(res, "cancelled");
    return;
  }
  if (!code || !safeStateMatches(oauthState, state) || !codeVerifier) {
    req.log.warn("Rejected invalid Google OAuth callback state");
    appRedirect(res, "failed");
    return;
  }

  try {
    const oauth = createGoogleOAuthClient(getGoogleRedirectUri(req));
    const { tokens } = await oauth.getToken({ code, codeVerifier });
    oauth.setCredentials(tokens);
    if (!tokens.id_token) {
      throw new Error("Google did not return a verified identity token.");
    }
    const ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || profile.email_verified !== true) {
      throw new Error("Google did not return a verified email address.");
    }

    const [existingAccount] = await db
      .select()
      .from(googleAccountsTable)
      .where(eq(googleAccountsTable.googleSub, profile.sub))
      .limit(1);
    const previousTokens = existingAccount
      ? JSON.parse(decryptOAuthTokens(existingAccount.encryptedTokens)) as Record<string, unknown>
      : {};
    const storedTokens = {
      ...previousTokens,
      ...tokens,
      refresh_token: tokens.refresh_token ?? previousTokens.refresh_token,
    };
    const scopes = tokens.scope ?? existingAccount?.scopes ?? getGoogleScopes().join(" ");
    const [account] = await db
      .insert(googleAccountsTable)
      .values({
        googleSub: profile.sub,
        email: profile.email,
        displayName: profile.name ?? profile.email,
        avatarUrl: profile.picture ?? null,
        encryptedTokens: encryptOAuthTokens(JSON.stringify(storedTokens)),
        scopes,
      })
      .onConflictDoUpdate({
        target: googleAccountsTable.googleSub,
        set: {
          email: profile.email,
          displayName: profile.name ?? profile.email,
          avatarUrl: profile.picture ?? null,
          encryptedTokens: encryptOAuthTokens(JSON.stringify(storedTokens)),
          scopes,
          updatedAt: new Date(),
        },
      })
      .returning();

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    req.session.accountId = account.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });
    appRedirect(res, "connected");
  } catch (error) {
    req.log.error({ error }, "Google OAuth callback failed");
    appRedirect(res, "failed");
  }
});

router.get("/auth/session", async (req, res): Promise<void> => {
  const accountId = req.session.accountId;
  const account = accountId ? await loadGoogleAccount(accountId) : undefined;
  if (!account && accountId) delete req.session.accountId;
  res.json(
    GetGoogleSessionResponse.parse({
      connected: Boolean(account),
      email: account?.email ?? null,
      displayName: account?.displayName ?? null,
      avatarUrl: account?.avatarUrl ?? null,
    }),
  );
});

router.post("/auth/logout", requireGoogleAccount, async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  res.clearCookie("smart-calendar.sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.sendStatus(204);
});

export default router;
