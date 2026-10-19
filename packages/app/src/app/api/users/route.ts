import { apiActor, apiHandler, assertAdmin, parseInput, requestScope } from "@cpg/core";
import { createUserSchema } from "@cpg/core/validators/users/create-user.schema";
import { apiWrite } from "../../../auth/api-write";
import { requireApiUser } from "../../../auth/require-api-user";

/** Every account, as the users screen lists them. Admin only: a normal user gets 403 (API-010). */
export const GET = apiHandler(async (request: Request) => {
  assertAdmin(await requireApiUser(request));
  return (await requestScope()).cradle.userService.list();
});

/**
 * Creates a normal user, as the users screen does (R07, TEN-004). Admin only, checked before the
 * key and the body. The body carries a password, so its idempotency fingerprint is an argon2id hash.
 */
export const POST = apiWrite(
  async ({ caller, body, cradle }) => cradle.userService.create(parseInput(createUserSchema, body), apiActor(caller)),
  { secretBody: true, authorize: assertAdmin },
);
