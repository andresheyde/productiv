import type { Credentials } from "google-auth-library";
import { google } from "googleapis";

import { createGoogleOAuthClient } from "../../shared/clients/google-oauth-client.ts";
import {
  googleScopes,
  isProduction,
  nativeAppScheme,
  nativeDevelopmentSchemes,
  webAppOrigin,
} from "../../shared/config/app-config.ts";
import type { GoogleProfile } from "./auth.types.ts";

type AuthState = {
  redirectTo: string;
};

export type AuthRedirectTarget = {
  kind: "native" | "web";
  redirectTo: string;
};

export function getGoogleAuthUrl(redirectTo?: string): string {
  const oauth2Client = createGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: googleScopes,
    ...(redirectTo ? { state: encodeAuthState({ redirectTo }) } : {}),
  });
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<Credentials> {
  console.log("[Auth] Exchanging authorization code for tokens...");

  const oauth2Client = createGoogleOAuthClient();
  const tokenResponse = await oauth2Client.getToken(code);

  console.log("[Auth] Successfully obtained credentials");
  return tokenResponse.tokens;
}

export async function fetchGoogleProfileFromTokens(
  tokens: Credentials,
): Promise<GoogleProfile> {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({
    version: "v2",
    auth: oauth2Client,
  });
  const response = await oauth2.userinfo.get();
  const data = response.data;

  if (!data.id) {
    throw new Error("Google user profile response did not include an id.");
  }

  return {
    googleSubject: data.id,
    email: data.email ?? null,
    fullName: data.name ?? null,
    avatarUrl: data.picture ?? null,
  };
}

export function getRedirectToFromAuthState(state: string | undefined) {
  if (!state) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as Partial<AuthState>;

    if (typeof parsed.redirectTo !== "string" || parsed.redirectTo.length === 0) {
      return undefined;
    }

    return parsed.redirectTo;
  } catch {
    return undefined;
  }
}

export function resolveAuthRedirectTarget(
  redirectTo: string,
): AuthRedirectTarget | null {
  try {
    const parsedUrl = new URL(redirectTo);

    if (isAllowedWebRedirectTarget(parsedUrl)) {
      return {
        kind: "web",
        redirectTo: parsedUrl.toString(),
      };
    }

    if (isAllowedNativeRedirectTarget(parsedUrl)) {
      return {
        kind: "native",
        redirectTo: parsedUrl.toString(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

function encodeAuthState(state: AuthState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function isAllowedNativeRedirectTarget(url: URL) {
  const scheme = url.protocol.slice(0, -1);

  if (scheme === nativeAppScheme) {
    return true;
  }

  return (
    !isProduction &&
    nativeDevelopmentSchemes.some((allowedScheme) => allowedScheme === scheme)
  );
}

function isAllowedWebRedirectTarget(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  if (url.origin === webAppOrigin) {
    return true;
  }

  return !isProduction && isLocalDevelopmentOrigin(url.origin);
}

function isLocalDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin);
}
