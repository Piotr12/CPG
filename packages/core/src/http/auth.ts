import type { SessionUser } from "../services/auth/auth.service";
import { ForbiddenError, UnauthorizedError } from "./errors";

/** The signed-in user, or `UnauthorizedError` when there is none. For actions and routes. */
export function assertSignedIn(user: SessionUser | null): SessionUser {
  if (!user) throw new UnauthorizedError();
  return user;
}

/** The signed-in admin, `UnauthorizedError` without a session, `ForbiddenError` for anyone else. */
export function assertAdmin(user: SessionUser | null): SessionUser {
  const signedIn = assertSignedIn(user);
  if (signedIn.role !== "admin") throw new ForbiddenError();
  return signedIn;
}
