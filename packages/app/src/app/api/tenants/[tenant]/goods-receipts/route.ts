import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { receiptCreateSchema, receiptListQuerySchema } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/goods-receipts">;

/**
 * The tenant's goods receipts with their lines, newest first, in pages of 100 (`?page=2`);
 * `?purchaseOrder=00000001` keeps one order's (404 `PURCHASE_ORDER_NOT_FOUND` for an order this
 * tenant doesn't have). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const filter = parseInput(receiptListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.goodsReceiptService.list(filter);
});

/**
 * Posts a goods receipt against one Open purchase order (R07, BUY-010…016): stock rises at the
 * order's location today and the order's lines receive, in one transaction. Any account with a
 * token may. An excess is accepted and listed in `warnings` (BUY-015).
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.goodsReceiptService.post(parseInput(receiptCreateSchema, body), apiActor(caller)),
);
