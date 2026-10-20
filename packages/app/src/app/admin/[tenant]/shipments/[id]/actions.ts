"use server";

import { assertSignedIn, tenantServerAction, uiActor, type IssueView, type Result } from "@cpg/core";
import { issueCreateSchema } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { currentUser } from "../../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../../routing/refresh-after-write";

/*
 * The shipment page's write. It is bound by its page to the tenant and dataset generation it rendered
 * (`tenantServerAction`), to the shipment it shows and to that shipment's order, whose page shows the
 * fulfilled quantities. Any signed-in account may post (spec Q11): the session is read before the
 * write's transaction opens and checked with `assertSignedIn` inside, after parsing.
 */

/** Posts a goods issue against the page's shipment: stock falls and the order's lines are fulfilled, atomically (SAL-010…013). */
export async function postIssue(tenant: string, generation: number, shipment: string, customerOrder: string, values: unknown): Promise<Result<IssueView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(issueCreateSchema, (input, { cradle }) =>
    cradle.goodsIssueService.post(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, { ...formValues(values), shipment });
  // The order's page shows its fulfilled quantities and status, the order list its status, and the stock page the new balance.
  return refreshAfterWrite(
    result,
    `/admin/${tenant}/shipments/${shipment}`,
    `/admin/${tenant}/customer-orders/${customerOrder}`,
    `/admin/${tenant}/customer-orders`,
    `/admin/${tenant}/stock`,
  );
}
