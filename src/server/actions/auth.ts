"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/access";
import { clientAddress } from "@/lib/auth/client-address";
import { verifyPassword } from "@/lib/auth/password";
import { getAuthEnv } from "@/lib/env";
import { loginLimiter } from "@/server/auth/login-limiter";
import { endSession, startSession } from "@/server/auth/session";
import { text } from "./form-data";
import { type ActionResult, type ActionState, failure } from "./result";

const MAX_PASSWORD_LENGTH = 200;

export async function loginAction(_prev: ActionState<null>, formData: FormData): Promise<ActionResult<null>> {
  let passwordHash: string;
  try {
    passwordHash = getAuthEnv().APP_PASSWORD_HASH;
  } catch {
    return failure("La connexion n'est pas configurée sur le serveur.");
  }

  const now = Date.now();
  const client = clientAddress(await headers());
  const retryAfterMs = loginLimiter.retryAfterMs(client, now);
  if (retryAfterMs > 0) return failure(`Trop d'essais. Réessaie dans ${Math.ceil(retryAfterMs / 60_000)} min.`);

  const password = text(formData, "password");
  if (!password || password.length > MAX_PASSWORD_LENGTH || !verifyPassword(password, passwordHash)) {
    loginLimiter.recordFailure(client, now);
    return { ok: false, errors: { password: ["Mot de passe incorrect."] } };
  }

  loginLimiter.reset(client);
  await startSession(now);
  redirect(safeNextPath(text(formData, "next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
