"use server";

import { assertSignedIn, tenantServerAction, uiActor, type IssueView, type Result, type ShipmentView } from "@cpg/core";
import { documentLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { issueCreateSchema } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { shipmentUpdateSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { currentUser } from "../../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../../routing/refresh-after-write";

/*
 * The shipment page's writes. Each is bound by its page to the tenant and dataset generation it rendered
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

/** The pages that show a shipment's plan or status: its own, and its order's, which lists its shipments. */
function shipmentPaths(tenant: string, shipment: string, customerOrder: string): string[] {
  return [`/admin/${tenant}/shipments/${shipment}`, `/admin/${tenant}/customer-orders/${customerOrder}`];
}

/** Replaces the page's shipment's planned date and lines at the version its dialog opened with (shipment edit spec Q2, Q5). */
export async function updateShipment(
  tenant: string,
  generation: number,
  shipment: string,
  customerOrder: string,
  version: number,
  values: unknown,
): Promise<Result<ShipmentView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(shipmentUpdateSchema, ({ version: loaded, ...changes }, { cradle }) =>
    cradle.shipmentService.update(shipment, changes, loaded, uiActor(assertSignedIn(actor))),
  )(tenant, generation, { ...formValues(values), version });
  return refreshAfterWrite(result, ...shipmentPaths(tenant, shipment, customerOrder));
}

/** Cancels the page's shipment at the version the page showed, when nothing was ever issued against it (shipment edit spec Q6). */
export async function cancelShipment(tenant: string, generation: number, shipment: string, customerOrder: string, version: number): Promise<Result<ShipmentView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(documentLifecycleSchema, (input, { cradle }) =>
    cradle.shipmentService.cancel(shipment, input.version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, { version });
  return refreshAfterWrite(result, ...shipmentPaths(tenant, shipment, customerOrder));
}
