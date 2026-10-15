import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { google } from "googleapis";

import { db, googleAccountsTable, type GoogleAccount } from "@workspace/db";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getGoogleRedirectUri(request?: {
  protocol: string;
  get(name: string): string | undefined;
}): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  if (!request) {
    throw new Error("GOOGLE_REDIRECT_URI is required outside an HTTP request");
  }
  const host = request.get("host");
  if (!host) throw new Error("The request host is unavailable");
  return `${request.protocol}://${host}/api/auth/google/callback`;
}

export function createGoogleOAuthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleScopes(): string[] {
  return [...SCOPES];
}

function encryptionKey(): Buffer {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET must be configured to protect OAuth tokens.");
  return createHash("sha256").update(`smart-calendar-token-v1:${sessionSecret}`).digest();
}

export function encryptOAuthTokens(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptOAuthTokens(payload: string): string {
  const [version, ivText, authTagText, encryptedText] = payload.split(".");
  if (version !== "v1" || !ivText || !authTagText || !encryptedText) {
    throw new Error("Stored Google credentials are unreadable.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function loadGoogleAccount(accountId: string): Promise<GoogleAccount | undefined> {
  const [account] = await db
    .select()
    .from(googleAccountsTable)
    .where(eq(googleAccountsTable.id, accountId))
    .limit(1);
  return account;
}

export async function getGoogleClient(account: GoogleAccount) {
  const client = createGoogleOAuthClient();
  const credentials = JSON.parse(decryptOAuthTokens(account.encryptedTokens)) as Record<string, unknown>;
  client.setCredentials(credentials);
  await client.getAccessToken();
  const refreshedCredentials = client.credentials;
  if (refreshedCredentials.access_token) {
    await db
      .update(googleAccountsTable)
      .set({
        encryptedTokens: encryptOAuthTokens(JSON.stringify(refreshedCredentials)),
        updatedAt: new Date(),
      })
      .where(eq(googleAccountsTable.id, account.id));
  }
  return client;
}

export async function refreshGoogleAccountTokens(accountId: string): Promise<GoogleAccount> {
  const account = await loadGoogleAccount(accountId);
  if (!account) throw new Error("The connected Google account no longer exists.");
  const client = await getGoogleClient(account);
  const encryptedTokens = encryptOAuthTokens(JSON.stringify(client.credentials));
  const [updated] = await db
    .update(googleAccountsTable)
    .set({ encryptedTokens, updatedAt: new Date() })
    .where(eq(googleAccountsTable.id, account.id))
    .returning();
  return updated ?? account;
}
