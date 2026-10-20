import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { issueCreateSchema, issueListQuerySchema } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/goods-issues">;

/**
 * The tenant's goods issues with their lines, newest first; `?shipment=00000001` keeps one shipment's
 * (404 `SHIPMENT_NOT_FOUND` for a shipment this tenant doesn't have). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const filter = parseInput(issueListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.goodsIssueService.list(filter);
});

/**
 * Posts a goods issue against one Open shipment (R07, SAL-010…013, INV-003): stock falls at the order's
 * location today and the order's lines are fulfilled, in one transaction. Never beyond the outstanding
 * or the stock on hand. Any account with a token may.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.goodsIssueService.post(parseInput(issueCreateSchema, body), apiActor(caller)),
);
