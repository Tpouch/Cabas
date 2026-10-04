import { type NextRequest, NextResponse } from "next/server";
import { decideAccess } from "@/lib/auth/access";
import { isValidSessionToken, SESSION_COOKIE, sessionSigningKey } from "@/lib/auth/session-token";
import { getAuthEnv } from "@/lib/env";

/** Optimistic check on every request; actions and route handlers check again. */
export function proxy(request: NextRequest) {
  let authenticated = false;
  try {
    const env = getAuthEnv();
    authenticated = isValidSessionToken(
      request.cookies.get(SESSION_COOKIE)?.value,
      sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH),
      Date.now(),
    );
  } catch {
    authenticated = false; // Missing configuration: fail closed.
  }

  const access = decideAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    authenticated,
  });
  if (access.kind === "redirect") return NextResponse.redirect(new URL(access.location, request.url));
  if (access.kind === "unauthorized") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
