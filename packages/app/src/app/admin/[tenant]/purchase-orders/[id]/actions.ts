"use server";

import { assertSignedIn, tenantServerAction, uiActor, type PostedReceiptView, type Result } from "@cpg/core";
import { receiptCreateSchema } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { currentUser } from "../../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../../routing/refresh-after-write";

/*
 * The purchase order page's write. It is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`) and to the order it shows. Any signed-in account may post (spec
 * Q10): the session is read before the write's transaction opens and checked with `assertSignedIn`
 * inside, after parsing.
 */

/** Posts a goods receipt against the page's order: stock rises and the order's lines receive, atomically (BUY-010…016). */
export async function postReceipt(tenant: string, generation: number, purchaseOrder: string, values: unknown): Promise<Result<PostedReceiptView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(receiptCreateSchema, (input, { cradle }) =>
    cradle.goodsReceiptService.post(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, { ...formValues(values), purchaseOrder });
  // The order's status shows on the list too, and the stock page shows the new balance.
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-orders/${purchaseOrder}`, `/admin/${tenant}/purchase-orders`, `/admin/${tenant}/stock`);
}
