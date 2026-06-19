import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";

import type { Credentials } from "google-auth-library";

import {
  sessionCookieName,
  sessionSecret,
} from "../config/app-config.ts";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionContextFromRequest,
  getSessionContextFromToken,
  getSessionCredentialsFromRequest,
  getSessionCredentialsFromToken,
  setSessionCookie,
  type SessionUser,
} from "./session.ts";

function requestWithHeaders(headers: Record<string, string | undefined>) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Parameters<typeof getSessionContextFromRequest>[0];
}

function createResponseRecorder() {
  const cookies: string[] = [];

  return {
    cookies,
    response: {
      append(name: string, value: string) {
        assert.equal(name, "Set-Cookie");
        cookies.push(value);
      },
    } as Parameters<typeof setSessionCookie>[0],
  };
}

function encryptPayload(payload: unknown) {
  const encryptionKey = createHash("sha256").update(sessionSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, encrypted, authTag]
    .map((value) => value.toString("base64url"))
    .join(".");
}

test("session tokens round-trip stored Google credentials", () => {
  const token = createSessionToken({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expiry_date: 1_800_000_000_000,
    scope: "email profile",
    token_type: "Bearer",
    id_token: "not-stored",
  } as Credentials);

  assert.deepEqual(getSessionCredentialsFromToken(token), {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expiry_date: 1_800_000_000_000,
    scope: "email profile",
    token_type: "Bearer",
  });
  assert.deepEqual(getSessionContextFromToken(token), {
    tokens: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expiry_date: 1_800_000_000_000,
      scope: "email profile",
      token_type: "Bearer",
    },
    user: null,
  });
});

test("session tokens round-trip embedded authenticated users", () => {
  const user: SessionUser = {
    id: "user-1",
    googleSubject: "google-1",
    email: "andre@example.com",
    fullName: "Andre",
    avatarUrl: null,
  };
  const token = createSessionToken({ access_token: "access-token" }, user);

  assert.deepEqual(getSessionContextFromToken(token), {
    tokens: { access_token: "access-token" },
    user,
  });
});

test("requests use bearer tokens before cookies", () => {
  const cookieToken = createSessionToken({ access_token: "cookie-token" });
  const bearerToken = createSessionToken({ access_token: "bearer-token" });
  const req = requestWithHeaders({
    authorization: `Bearer ${bearerToken}`,
    cookie: [
      "ignored",
      `${sessionCookieName}=${encodeURIComponent(cookieToken)}`,
    ].join("; "),
  });

  assert.deepEqual(getSessionCredentialsFromRequest(req), {
    access_token: "bearer-token",
  });
});

test("requests fall back to the session cookie", () => {
  const cookieToken = createSessionToken({ refresh_token: "cookie-token" });
  const req = requestWithHeaders({
    cookie: [
      "malformed",
      ` =ignored`,
      `other=value`,
      `${sessionCookieName}=${encodeURIComponent(cookieToken)}`,
    ].join("; "),
  });

  assert.deepEqual(getSessionContextFromRequest(req), {
    tokens: { refresh_token: "cookie-token" },
    user: null,
  });
});

test("requests without valid auth return null", () => {
  assert.equal(
    getSessionContextFromRequest(requestWithHeaders({})),
    null,
  );
  assert.equal(
    getSessionContextFromRequest(
      requestWithHeaders({ authorization: "Basic nope" }),
    ),
    null,
  );
  assert.equal(
    getSessionContextFromRequest(
      requestWithHeaders({
        authorization: "Bearer",
        cookie: `${sessionCookieName}=not.a.valid.token`,
      }),
    ),
    null,
  );
});

test("session cookie helpers append set and clear cookie headers", () => {
  const token = createSessionToken({ access_token: "access-token" });
  const recorder = createResponseRecorder();

  setSessionCookie(recorder.response, token);
  clearSessionCookie(recorder.response);

  assert.match(recorder.cookies[0] ?? "", new RegExp(`^${sessionCookieName}=`));
  assert.match(recorder.cookies[0] ?? "", /Max-Age=2592000/u);
  assert.match(recorder.cookies[0] ?? "", /HttpOnly/u);
  assert.match(recorder.cookies[0] ?? "", /SameSite=Lax/u);
  assert.doesNotMatch(recorder.cookies[0] ?? "", /Secure/u);
  assert.match(recorder.cookies[1] ?? "", new RegExp(`^${sessionCookieName}=`));
  assert.match(recorder.cookies[1] ?? "", /Max-Age=0/u);
  assert.match(recorder.cookies[1] ?? "", /Expires=Thu, 01 Jan 1970/u);
});

test("invalid encrypted payloads are rejected", () => {
  assert.equal(getSessionContextFromToken("missing-parts"), null);
  assert.equal(getSessionContextFromToken(".."), null);
  assert.equal(getSessionContextFromToken("not.valid.parts"), null);
  assert.equal(
    getSessionContextFromToken(
      encryptPayload({ version: 1, tokens: { access_token: "token" } }),
    ),
    null,
  );
  assert.equal(
    getSessionContextFromToken(
      encryptPayload({
        issuedAt: Date.now(),
        version: 1,
        tokens: { access_token: 7 },
      }),
    ),
    null,
  );
  assert.equal(
    getSessionContextFromToken(
      encryptPayload({
        issuedAt: Date.now(),
        version: 1,
        tokens: { expiry_date: "tomorrow" },
      }),
    ),
    null,
  );
  assert.equal(
    getSessionContextFromToken(
      encryptPayload({
        issuedAt: Date.now(),
        version: 2,
        tokens: { access_token: "token" },
      }),
    ),
    null,
  );
  assert.equal(
    getSessionContextFromToken(
      encryptPayload({
        issuedAt: Date.now(),
        version: 3,
        tokens: { access_token: "token" },
      }),
    ),
    null,
  );
});
