import { apiActor } from "@cpg/core";
import { apiWrite, type WriteContext } from "../../../../auth/api-write";

/**
 * Revokes one of the caller's own tokens, at once (API-008); a token may revoke itself. Anything
 * else, a malformed id included, is 404 `TOKEN_NOT_FOUND`. Keyed like every write (R07): a repeat
 * made with another of the caller's tokens replays the 200. The Global audit names the token that
 * made the call (AUD-007).
 */
export const DELETE = apiWrite(async ({ caller, context, cradle }: WriteContext<RouteContext<"/api/tokens/[id]">>) =>
  cradle.apiTokenService.revoke(caller.userId, (await context.params).id, apiActor(caller)),
);
