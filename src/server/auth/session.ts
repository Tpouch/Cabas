import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  isValidSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionSigningKey,
} from "@/lib/auth/session-token";
import { getAuthEnv } from "@/lib/env";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export async function startSession(nowMs = Date.now()): Promise<void> {
  const env = getAuthEnv();
  const token = createSessionToken(nowMs + SESSION_MAX_AGE_SECONDS * 1000, sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Fails closed: a missing or invalid configuration means nobody is signed in. */
export async function hasSession(nowMs = Date.now()): Promise<boolean> {
  try {
    const env = getAuthEnv();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return isValidSessionToken(token, sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH), nowMs);
  } catch {
    return false;
  }
}

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new UnauthorizedError();
}
