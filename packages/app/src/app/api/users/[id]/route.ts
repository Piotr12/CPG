import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import { setUserActiveBodySchema } from "@cpg/core/validators/users/set-user-active.schema";
import { apiWrite, type WriteContext } from "../../../../auth/api-write";

/**
 * Deactivates (signing the user out everywhere, R06) or reactivates a normal user, as the users
 * screen does. Admin only, checked before the key and the body. The body carries the version the client loaded: a stale one is 409
 * `VERSION_CONFLICT` (API-029). The built-in admin, an unknown or a malformed id is 404.
 */
export const PATCH = apiWrite(
  async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/users/[id]">>) => {
    const { active, version } = parseInput(setUserActiveBodySchema, body);
    return cradle.userService.setActive((await context.params).id, active, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
