import type { Request } from "express";

import {
  getSessionContextFromRequest,
  type SessionUser,
} from "../../shared/auth/session.ts";
import { fetchGoogleProfileFromTokens } from "./auth.service.ts";
import { getUserById, upsertUserProfile } from "./auth.persistence.ts";
import type { AuthenticatedUser, GoogleProfile } from "./auth.types.ts";

export async function resolveAuthenticatedRequest(
  req: Pick<Request, "header">,
): Promise<{ tokens: NonNullable<ReturnType<typeof getSessionContextFromRequest>>["tokens"]; user: AuthenticatedUser } | null> {
  const session = getSessionContextFromRequest(req);

  if (!session) {
    return null;
  }

  if (session.user) {
    const existingUser = await getUserById(session.user.id);

    if (existingUser) {
      return {
        tokens: session.tokens,
        user: existingUser,
      };
    }

    const user = await upsertUserProfile(sessionUserToGoogleProfile(session.user));

    return {
      tokens: session.tokens,
      user,
    };
  }

  const profile = await fetchGoogleProfileFromTokens(session.tokens);
  const user = await upsertUserProfile(profile);

  return {
    tokens: session.tokens,
    user,
  };
}

function sessionUserToGoogleProfile(user: SessionUser): GoogleProfile {
  return {
    googleSubject: user.googleSubject,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
  };
}
