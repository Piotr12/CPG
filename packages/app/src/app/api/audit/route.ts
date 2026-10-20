import { parseInput, requestScope } from "@cpg/core";
import { auditListSchema } from "@cpg/core/validators/audit/audit-list.schema";
import { requireApiUser } from "../../../auth/require-api-user";
import { apiHandler } from "../../../routing/api-handler";

/**
 * A page of the Global audit, newest first (`?before=<entry id>&limit=`), for every signed-in
 * account (AUD-009). Read-only: no other method is exported, so Next.js answers 405 (AUD-010).
 */
export const GET = apiHandler(async (request: Request) => {
  await requireApiUser(request);
  const query = parseInput(auditListSchema, Object.fromEntries(new URL(request.url).searchParams));
  return (await requestScope()).cradle.auditService.listGlobal(query);
});
