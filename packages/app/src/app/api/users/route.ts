import { apiHandler, assertAdmin, requestScope } from "@cpg/core";
import { requireApiUser } from "../../../auth/require-api-user";

/** Every account, as the users screen lists them. Admin only: a normal user gets 403 (API-010). */
export const GET = apiHandler(async (request: Request) => {
  assertAdmin(await requireApiUser(request));
  return (await requestScope()).cradle.userService.list();
});
