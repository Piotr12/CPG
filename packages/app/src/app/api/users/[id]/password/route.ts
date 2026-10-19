import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import { resetPasswordBodySchema } from "@cpg/core/validators/users/reset-password.schema";
import { apiWrite, type WriteContext } from "../../../../../auth/api-write";

/**
 * Replaces a normal user's password and signs them out everywhere, deleting their tokens (R06), as
 * the users screen does. Admin only, at the version the client loaded (409 `VERSION_CONFLICT`
 * otherwise). The body carries a password, so its idempotency fingerprint is an argon2id hash.
 */
export const PUT = apiWrite(
  async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/users/[id]/password">>) => {
    assertAdmin(caller);
    const { password, version } = parseInput(resetPasswordBodySchema, body);
    return cradle.userService.resetPassword((await context.params).id, password, version, apiActor(caller));
  },
  { secretBody: true },
);
