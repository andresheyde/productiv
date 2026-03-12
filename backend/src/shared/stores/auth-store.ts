import { randomUUID } from "node:crypto";

import type { Credentials } from "google-auth-library";

const authStore = new Map<string, Credentials>();

export function saveAuthTokens(tokens: Credentials): string {
  const authId = randomUUID();
  authStore.set(authId, { ...tokens });
  return authId;
}

export function getAuthTokens(authId: string): Credentials | undefined {
  const tokens = authStore.get(authId);
  return tokens ? { ...tokens } : undefined;
}
