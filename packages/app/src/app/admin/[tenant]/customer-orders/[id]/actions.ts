"use server";

import { assertSignedIn, tenantServerAction, uiActor, type CustomerOrderView, type Result, type ShipmentView } from "@cpg/core";
import { shipmentCreateSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { customerOrderLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { currentUser } from "../../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../../routing/refresh-after-write";

/*
 * The customer order page's write. It is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`) and to the order it shows. Any signed-in account may create a
 * shipment (spec Q11): the session is read before the write's transaction opens and checked with
 * `assertSignedIn` inside, after parsing.
 */

/** Creates a shipment against the page's order (SAL-006…009); it moves no stock. */
export async function createShipment(tenant: string, generation: number, customerOrder: string, values: unknown): Promise<Result<ShipmentView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(shipmentCreateSchema, (input, { cradle }) =>
    cradle.shipmentService.create(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, { ...formValues(values), customerOrder });
  return refreshAfterWrite(result, `/admin/${tenant}/customer-orders/${customerOrder}`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function cancelCustomerOrder(tenant: string, generation: number, id: string, values: unknown): Promise<Result<CustomerOrderView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(customerOrderLifecycleSchema, (input, { cradle }) =>
    cradle.customerOrderService.cancel(id, input.version, uiActor(assertSignedIn(actor)), input.lines),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/customer-orders`, `/admin/${tenant}/customer-orders/${id}`, `/admin/${tenant}/shipments`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function closeEarlyCustomerOrder(tenant: string, generation: number, id: string, values: unknown): Promise<Result<CustomerOrderView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(customerOrderLifecycleSchema, (input, { cradle }) =>
    cradle.customerOrderService.closeEarly(id, input.version, uiActor(assertSignedIn(actor)), input.lines),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/customer-orders`, `/admin/${tenant}/customer-orders/${id}`, `/admin/${tenant}/shipments`);
}
