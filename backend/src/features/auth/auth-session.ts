import type { Request } from "express";

import {
  getSessionContextFromRequest,
  type SessionUser,
} from "../../shared/auth/session.ts";
import { fetchGoogleProfileFromTokens } from "./auth.service.ts";
import { upsertUserProfile } from "./auth.persistence.ts";
import type { AuthenticatedUser } from "./auth.types.ts";

export async function resolveAuthenticatedRequest(
  req: Pick<Request, "header">,
): Promise<{ tokens: NonNullable<ReturnType<typeof getSessionContextFromRequest>>["tokens"]; user: AuthenticatedUser } | null> {
  const session = getSessionContextFromRequest(req);

  if (!session) {
    return null;
  }

  if (session.user) {
    return {
      tokens: session.tokens,
      user: sessionUserToAuthenticatedUser(session.user),
    };
  }

  const profile = await fetchGoogleProfileFromTokens(session.tokens);
  const user = await upsertUserProfile(profile);

  return {
    tokens: session.tokens,
    user,
  };
}

function sessionUserToAuthenticatedUser(user: SessionUser): AuthenticatedUser {
  return {
    id: user.id,
    googleSubject: user.googleSubject,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
  };
}
