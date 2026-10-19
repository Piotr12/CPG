import { redirect, unstable_rethrow } from "next/navigation";
import { requestScope, type SessionUser } from "@cpg/core";
import { readSessionToken } from "./session-cookie";

/** Where an unauthenticated visitor is sent. */
export const SIGN_IN_PATH = "/login";

/** The signed-in user for this request, or null. Any error counts as signed out (fail closed). */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const { authService } = (await requestScope()).cradle;
    return await authService.validateSession(await readSessionToken());
  } catch (error) {
    // Next.js signals dynamic rendering and redirects by throwing; those must propagate.
    unstable_rethrow(error);
    console.error("Session check failed:", error);
    return null;
  }
}

/**
 * Gate for every `/admin` page: call it inside the `<Suspense>` child that renders the page's data,
 * so nothing is rendered for a visitor without an admin session. Redirects to sign-in otherwise.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (user?.role !== "admin") redirect(SIGN_IN_PATH);
  return user;
}
