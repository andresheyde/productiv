import type { Credentials } from "google-auth-library";

import { createGoogleOAuthClient } from "../../shared/clients/google-oauth-client.ts";
import { googleScopes } from "../../shared/config/app-config.ts";

export function getGoogleAuthUrl(): string {
  const oauth2Client = createGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: googleScopes,
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
