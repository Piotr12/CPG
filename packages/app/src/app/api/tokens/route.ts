import { requestScope } from "@cpg/core";
import { requireApiUser } from "../../../auth/require-api-user";
import { apiHandler } from "../../../routing/api-handler";

/**
 * The caller's own API tokens, newest first: id, name, created and last used, never a secret.
 * There is deliberately no `POST`: tokens are created only in the signed-in UI (R07, API-032), so
 * Next.js answers any other method with 405.
 */
export const GET = apiHandler(async (request: Request) => {
  const caller = await requireApiUser(request);
  return (await requestScope()).cradle.apiTokenService.list(caller.userId);
});
