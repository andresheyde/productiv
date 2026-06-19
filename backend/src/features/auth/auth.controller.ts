import type { Request, Response } from "express";

import {
  clearSessionCookie,
  createSessionToken,
  getSessionCredentialsFromRequest,
  setSessionCookie,
} from "../../shared/auth/session.ts";
import {
  exchangeCodeForTokens,
  fetchGoogleProfileFromTokens,
  getGoogleAuthUrl,
  getRedirectToFromAuthState,
  resolveAuthRedirectTarget,
} from "./auth.service.ts";
import { upsertUserProfile } from "./auth.persistence.ts";
import { resolveAuthenticatedRequest } from "./auth-session.ts";

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
  const redirectToParam =
    typeof req.query.redirectTo === "string" ? req.query.redirectTo : undefined;
  const redirectTarget = redirectToParam
    ? resolveAuthRedirectTarget(redirectToParam)
    : null;

  if (redirectToParam && !redirectTarget) {
    return res.status(400).json({ error: "Invalid redirectTo parameter" });
  }

  const url = getGoogleAuthUrl(redirectTarget?.redirectTo);
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
    const profile = await fetchGoogleProfileFromTokens(tokens);
    const user = await upsertUserProfile(profile);
    const sessionToken = createSessionToken(tokens, user);
    const redirectTo = getRedirectToFromAuthState(
      typeof req.query.state === "string" ? req.query.state : undefined,
    );
    const redirectTarget = redirectTo
      ? resolveAuthRedirectTarget(redirectTo)
      : null;

    console.log("[Auth] Created stateless session for later calendar requests");

    if (redirectTo && !redirectTarget) {
      return res.status(400).json({ error: "Invalid redirectTo parameter" });
    }

    if (redirectTarget?.kind === "web") {
      setSessionCookie(res, sessionToken);
      return res.redirect(redirectTarget.redirectTo);
    }

    if (redirectTarget?.kind === "native") {
      const redirectUrl = new URL(redirectTarget.redirectTo);
      redirectUrl.searchParams.set("sessionToken", sessionToken);
      return res.redirect(redirectUrl.toString());
    }

    setSessionCookie(res, sessionToken);
    return res.json({ isAuthenticated: true });
  } catch (error) {
    console.error("[Auth] Failed to complete Google authentication", error);
    return res
      .status(500)
      .json({ error: "Failed to authenticate with Google" });
  }
}

export function getAuthSession(req: Request, res: Response) {
  return resolveAuthenticatedRequest(req)
    .then((session) =>
      res.json({
        isAuthenticated: session !== null,
        user:
          session === null
            ? null
            : {
                id: session.user.id,
                email: session.user.email,
                fullName: session.user.fullName,
                avatarUrl: session.user.avatarUrl,
              },
      }),
    )
    .catch((error) => {
      if (!getSessionCredentialsFromRequest(req)) {
        return res.json({ isAuthenticated: false, user: null });
      }

      console.error("[Auth] Failed to resolve auth session", error);
      return res.status(500).json({ error: "Failed to resolve auth session" });
    });
}

export function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  return res.status(204).send();
}
