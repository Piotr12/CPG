import { apiHandler, requestScope } from "@cpg/core";
import { requireApiUser } from "../../../../auth/require-api-user";

/**
 * Revokes one of the caller's own tokens, at once (API-008); a token may revoke itself. Anything
 * else, a malformed id included, is 404 `TOKEN_NOT_FOUND`. State-changing, so bearer only.
 */
export const DELETE = apiHandler(async (request: Request, { params }: RouteContext<"/api/tokens/[id]">) => {
  const caller = await requireApiUser(request);
  return (await requestScope()).cradle.apiTokenService.revoke(caller.userId, (await params).id);
});
