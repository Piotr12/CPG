import { apiHandler, requestScope } from "@cpg/core";
import { requireApiUser } from "../../../auth/require-api-user";

/** Both tenants' metadata (API-034): code, name and current dataset generation. Global: no tenant. */
export const GET = apiHandler(async () => {
  await requireApiUser();
  return (await requestScope()).cradle.tenantService.list();
});
