import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { Request, Response } from "express";
import type { Credentials } from "google-auth-library";

import {
  isProduction,
  sessionCookieMaxAgeSeconds,
  sessionCookieName,
  sessionSecret,
} from "../config/app-config.ts";

export type SessionUser = {
  id: string;
  googleSubject: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

type StoredGoogleCredentials = {
  access_token?: string;
  expiry_date?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type StoredSessionUser = {
  id: string;
  google_subject: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type SessionPayloadV1 = {
  issuedAt: number;
  tokens: StoredGoogleCredentials;
  version: 1;
};

type SessionPayloadV2 = {
  issuedAt: number;
  tokens: StoredGoogleCredentials;
  user: StoredSessionUser;
  version: 2;
};

type SessionPayload = SessionPayloadV1 | SessionPayloadV2;

const cookiePath = "/";
const encryptionKey = createHash("sha256").update(sessionSecret).digest();

export function createSessionToken(tokens: Credentials, user?: SessionUser) {
  const payload = JSON.stringify({
    issuedAt: Date.now(),
    tokens: toStoredCredentials(tokens),
    ...(user ? { user: toStoredSessionUser(user), version: 2 as const } : { version: 1 as const }),
  } satisfies SessionPayload);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, encrypted, authTag]
    .map((value) => value.toString("base64url"))
    .join(".");
}

export function clearSessionCookie(res: Response) {
  res.append(
    "Set-Cookie",
    serializeCookie(sessionCookieName, "", {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: cookiePath,
      sameSite: "Lax",
      secure: isProduction,
    }),
  );
}

export function getSessionCredentialsFromRequest(
  req: Pick<Request, "header">,
): Credentials | null {
  return getSessionContextFromRequest(req)?.tokens ?? null;
}

export function getSessionCredentialsFromToken(
  sessionToken: string,
): Credentials | null {
  return getSessionContextFromToken(sessionToken)?.tokens ?? null;
}

export function getSessionContextFromRequest(req: Pick<Request, "header">) {
  const sessionToken = getSessionTokenFromRequest(req);

  if (!sessionToken) {
    return null;
  }

  return getSessionContextFromToken(sessionToken);
}

export function getSessionContextFromToken(sessionToken: string): {
  tokens: Credentials;
  user: SessionUser | null;
} | null {
  const payload = readSessionPayload(sessionToken);

  if (!payload) {
    return null;
  }

  return {
    tokens: { ...payload.tokens },
    user: payload.version === 2 ? toSessionUser(payload.user) : null,
  };
}

export function setSessionCookie(res: Response, sessionToken: string) {
  res.append(
    "Set-Cookie",
    serializeCookie(sessionCookieName, sessionToken, {
      httpOnly: true,
      maxAge: sessionCookieMaxAgeSeconds,
      path: cookiePath,
      sameSite: "Lax",
      secure: isProduction,
    }),
  );
}

function getSessionTokenFromRequest(req: Pick<Request, "header">) {
  const bearerToken = getBearerToken(req.header("authorization"));

  if (bearerToken) {
    return bearerToken;
  }

  const cookieHeader = req.header("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookies(cookieHeader);
  return cookies[sessionCookieName] ?? null;
}

function getBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function parseCookies(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      if (!name) {
        return cookies;
      }

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function readSessionPayload(sessionToken: string): SessionPayload | null {
  const parts = sessionToken.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const ivPart = parts[0];
    const encryptedPart = parts[1];
    const authTagPart = parts[2];

    if (!ivPart || !encryptedPart || !authTagPart) {
      return null;
    }

    const iv = Buffer.from(ivPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const authTag = Buffer.from(authTagPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<SessionPayload>;

    if (
      typeof parsed.issuedAt !== "number" ||
      !isStoredGoogleCredentials(parsed.tokens)
    ) {
      return null;
    }

    if (parsed.version === 1) {
      return {
        issuedAt: parsed.issuedAt,
        tokens: parsed.tokens,
        version: 1,
      };
    }

    if (parsed.version === 2 && isStoredSessionUser(parsed.user)) {
      return {
        issuedAt: parsed.issuedAt,
        tokens: parsed.tokens,
        user: parsed.user,
        version: 2,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isStoredGoogleCredentials(
  tokens: Partial<StoredGoogleCredentials> | undefined,
): tokens is StoredGoogleCredentials {
  if (!tokens || typeof tokens !== "object") {
    return false;
  }

  const allowedStringKeys: Array<keyof StoredGoogleCredentials> = [
    "access_token",
    "refresh_token",
    "scope",
    "token_type",
  ];

  const stringsAreValid = allowedStringKeys.every((key) => {
    const value = tokens[key];
    return value === undefined || typeof value === "string";
  });

  const expiryDate = tokens.expiry_date;
  const expiryDateIsValid =
    expiryDate === undefined || typeof expiryDate === "number";

  return stringsAreValid && expiryDateIsValid;
}

function isStoredSessionUser(
  user: Partial<StoredSessionUser> | undefined,
): user is StoredSessionUser {
  if (!user || typeof user !== "object") {
    return false;
  }

  return (
    typeof user.id === "string" &&
    user.id.length > 0 &&
    typeof user.google_subject === "string" &&
    user.google_subject.length > 0 &&
    (user.email === undefined || user.email === null || typeof user.email === "string") &&
    (user.full_name === undefined ||
      user.full_name === null ||
      typeof user.full_name === "string") &&
    (user.avatar_url === undefined ||
      user.avatar_url === null ||
      typeof user.avatar_url === "string")
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "None" | "Strict";
    secure?: boolean;
  },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function toStoredCredentials(tokens: Credentials): StoredGoogleCredentials {
  const storedCredentials: StoredGoogleCredentials = {};

  if (typeof tokens.access_token === "string") {
    storedCredentials.access_token = tokens.access_token;
  }

  if (typeof tokens.expiry_date === "number") {
    storedCredentials.expiry_date = tokens.expiry_date;
  }

  if (typeof tokens.refresh_token === "string") {
    storedCredentials.refresh_token = tokens.refresh_token;
  }

  if (typeof tokens.scope === "string") {
    storedCredentials.scope = tokens.scope;
  }

  if (typeof tokens.token_type === "string") {
    storedCredentials.token_type = tokens.token_type;
  }

  return storedCredentials;
}

function toStoredSessionUser(user: SessionUser): StoredSessionUser {
  return {
    id: user.id,
    google_subject: user.googleSubject,
    email: user.email,
    full_name: user.fullName,
    avatar_url: user.avatarUrl,
  };
}

function toSessionUser(user: StoredSessionUser): SessionUser {
  return {
    id: user.id,
    googleSubject: user.google_subject,
    email: user.email ?? null,
    fullName: user.full_name ?? null,
    avatarUrl: user.avatar_url ?? null,
  };
}
