import { cookies } from "next/headers";

/** The cookie that carries the raw session token (the database only knows its hash). */
export const SESSION_COOKIE = "cpg_session";

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * Sets the session cookie. Server Functions and Route Handlers only: Next.js can't set cookies
 * while a Server Component renders. `secure` is on in production (plain HTTP works in development).
 */
export async function writeSessionCookie(token: string, expiresAt: Date, { secure }: { secure: boolean }) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
