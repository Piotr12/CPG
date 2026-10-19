import { UnauthorizedError, type SessionUser } from "@cpg/core";
import { currentUser } from "./require-admin";

/**
 * Gate for every API route handler: the signed-in account, or `UnauthorizedError` (401 through
 * `apiHandler`). Fails closed, like `currentUser`. Bearer tokens (E01-S03) authenticate here too.
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
