import type { Request, Response } from "express";

import { saveAuthTokens } from "../../shared/stores/auth-store.ts";
import { exchangeCodeForTokens, getGoogleAuthUrl } from "./auth.service.ts";

interface GoogleAuthQuery {
  redirectTo?: string;
}

interface GoogleCallbackQuery {
  code?: string;
  scope?: string;
  state?: string;
}

export function redirectToGoogleAuth(
  req: Request<{}, {}, {}, GoogleAuthQuery>,
  res: Response,
) {
  const redirectTo =
    typeof req.query.redirectTo === "string" ? req.query.redirectTo : undefined;
  const url = getGoogleAuthUrl(redirectTo);
  res.redirect(url);
}

export async function handleGoogleCallback(
  req: Request<{}, {}, {}, GoogleCallbackQuery>,
  res: Response,
) {
  const { code } = req.query;

  if (typeof code !== "string" || code.length === 0) {
    return res.status(400).send("Missing code parameter");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const authId = saveAuthTokens(tokens);
    const redirectTo =
      typeof req.query.state === "string" ? req.query.state : undefined;

    console.log("[Auth] Stored credentials for later calendar requests");

    if (redirectTo) {
      try {
        const redirectUrl = new URL(redirectTo);
        redirectUrl.searchParams.set("authId", authId);
        return res.redirect(redirectUrl.toString());
      } catch (error) {
        console.error("[Auth] Invalid redirectTo received in callback state", error);
        return res.status(400).json({ error: "Invalid redirectTo parameter" });
      }
    }

    return res.json({ authId });
  } catch (error) {
    console.error("[Auth] Failed to complete Google authentication", error);
    return res
      .status(500)
      .json({ error: "Failed to authenticate with Google" });
  }
}
