import { type NextFunction, type Request, type Response } from "express";

import type { GoogleAccount } from "@workspace/db";

import { loadGoogleAccount } from "../lib/google";

declare module "express-session" {
  interface SessionData {
    accountId?: string;
    oauthState?: string;
    oauthCodeVerifier?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      googleAccount?: GoogleAccount;
    }
  }
}

export async function requireGoogleAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const accountId = req.session.accountId;
  if (!accountId) {
    res.status(401).json({ error: "Connect a Google account to continue." });
    return;
  }
  try {
    const account = await loadGoogleAccount(accountId);
    if (!account) {
      delete req.session.accountId;
      res.status(401).json({ error: "Connect a Google account to continue." });
      return;
    }
    req.googleAccount = account;
    next();
  } catch (error) {
    next(error);
  }
}
