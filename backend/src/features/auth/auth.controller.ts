import type { Request, Response } from "express";

import { saveAuthTokens } from "../../shared/stores/auth-store.ts";
import { exchangeCodeForTokens, getGoogleAuthUrl } from "./auth.service.ts";

interface GoogleCallbackQuery {
  code?: string;
  scope?: string;
  state?: string;
}

export function redirectToGoogleAuth(_req: Request, res: Response) {
  const url = getGoogleAuthUrl();
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

    console.log("[Auth] Stored credentials for later calendar requests");
    return res.json({ authId });
  } catch (error) {
    console.error("[Auth] Failed to complete Google authentication", error);
    return res
      .status(500)
      .json({ error: "Failed to authenticate with Google" });
  }
}
