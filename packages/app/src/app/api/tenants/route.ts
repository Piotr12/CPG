import { requestScope } from "@cpg/core";
import { requireApiUser } from "../../../auth/require-api-user";
import { apiHandler } from "../../../routing/api-handler";

/** Both tenants' metadata (API-034): code, name and current dataset generation. Global: no tenant. */
export const GET = apiHandler(async (request: Request) => {
  await requireApiUser(request);
  return (await requestScope()).cradle.tenantService.list();
});
