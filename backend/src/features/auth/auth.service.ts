import type { Credentials } from "google-auth-library";

import {
  isProduction,
  nativeAppScheme,
  nativeDevelopmentSchemes,
  webAppOrigin,
} from "../../shared/config/app-config.ts";
import { getGoogleIntegrationProvider } from "../../shared/google/google-integration-factory.ts";
import type { GoogleProfile } from "./auth.types.ts";

type AuthState = {
  redirectTo: string;
};

export type AuthRedirectTarget = {
  kind: "native" | "web";
  redirectTo: string;
};

export function getGoogleAuthUrl(redirectTo?: string): string {
  return getGoogleIntegrationProvider().getAuthUrl({
    ...(redirectTo ? { redirectTo, state: encodeAuthState({ redirectTo }) } : {}),
  });
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<Credentials> {
  return getGoogleIntegrationProvider().exchangeCodeForTokens(code);
}

export async function fetchGoogleProfileFromTokens(
  tokens: Credentials,
): Promise<GoogleProfile> {
  return getGoogleIntegrationProvider().fetchProfileFromTokens(tokens);
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
