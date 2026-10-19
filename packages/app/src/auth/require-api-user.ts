import { requestScope, UnauthorizedError, type ApiActor, type SessionUser } from "@cpg/core";
import { currentUser } from "./require-admin";

/** Whoever an API route serves: a bearer token's owner, or a browser session on a safe request. */
export type ApiCaller = ApiActor | SessionUser;

/** One message for every bad token, so a response never says whether it was unknown or revoked. */
export const INVALID_TOKEN = "Invalid or revoked token.";
export const BEARER_REQUIRED = "Use a bearer token for this request.";

/** `Authorization: Bearer <secret>`; the scheme is case-insensitive (RFC 9110). */
const BEARER = /^bearer(?:\s+(.*))?$/i;
/** The methods a session cookie may call: they change nothing, so they need no CSRF defence. */
const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Gate for every API route handler: the caller, or `UnauthorizedError` (401 through `apiHandler`).
 * A bearer token authenticates on its own: a bad one is refused even next to a valid session
 * cookie. Without one, the session cookie is accepted for `GET`/`HEAD` only; CPG's own pages change
 * state through server actions, so a cookie never needs to reach a state-changing route.
 * Fails closed: an error while checking propagates as a 500.
 */
export async function requireApiUser(request: Request): Promise<ApiCaller> {
  const bearer = request.headers.get("authorization")?.trim().match(BEARER);
  if (bearer) {
    const secret = bearer[1]?.trim();
    const actor = secret ? await (await requestScope()).cradle.apiTokenService.authenticate(secret) : null;
    if (!actor) throw new UnauthorizedError(INVALID_TOKEN);
    return actor;
  }
  if (!SAFE_METHODS.has(request.method)) throw new UnauthorizedError(BEARER_REQUIRED);
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
