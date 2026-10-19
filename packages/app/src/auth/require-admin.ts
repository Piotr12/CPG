import { redirect, unstable_rethrow } from "next/navigation";
import { requestScope, type SessionUser } from "@cpg/core";
import { readSessionToken } from "./session-cookie";

/** Where an unauthenticated visitor is sent. */
export const SIGN_IN_PATH = "/login";

/**
 * The signed-in user for this request, or null. Any error counts as signed out (fail closed).
 * The cookie is read first: it makes the caller request-time, and without one there is no reason
 * to open the database.
 */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const token = await readSessionToken();
    if (!token) return null;
    const { authService } = (await requestScope()).cradle;
    return await authService.validateSession(token);
  } catch (error) {
    // Next.js signals dynamic rendering and redirects by throwing; those must propagate.
    unstable_rethrow(error);
    console.error("Session check failed:", error);
    return null;
  }
}

/** Where every signed-in account lands, and where a normal user is sent from an admin-only page. */
export const HOME_PATH = "/admin";

/**
 * Gate for every `/admin` page any active account may see: call it inside the `<Suspense>` child
 * that renders the page's data, so nothing renders without a session. Redirects to sign-in otherwise.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}

/**
 * Gate for admin-only `/admin` pages (listed in `tests/admin-pages-require-admin.test.ts`), used
 * like `requireUser()`. A signed-in normal user goes back to `/admin`; anyone else to sign-in.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect(HOME_PATH);
  return user;
}
