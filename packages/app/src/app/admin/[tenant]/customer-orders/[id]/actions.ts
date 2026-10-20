"use server";

import { assertSignedIn, tenantServerAction, uiActor, type Result, type ShipmentView } from "@cpg/core";
import { shipmentCreateSchema } from "@cpg/core/validators/shipments/shipment.schema";
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
