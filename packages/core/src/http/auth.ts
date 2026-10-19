import type { Actor } from "../services/auth/actor";
import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * The signed-in actor (a session or an API token), or `UnauthorizedError` when there is none. For
 * actions and routes.
 */
export function assertSignedIn<A extends Actor>(user: A | null): A {
  if (!user) throw new UnauthorizedError();
  return user;
}

/** The admin, `UnauthorizedError` without a credential, `ForbiddenError` for anyone else. */
export function assertAdmin<A extends Actor>(user: A | null): A {
  const signedIn = assertSignedIn(user);
  if (signedIn.role !== "admin") throw new ForbiddenError();
  return signedIn;
}
