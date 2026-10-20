"use server";

import { assertSignedIn, tenantServerAction, uiActor, type OrderView, type Result } from "@cpg/core";
import { orderCreateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { currentUser } from "../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The purchase-order screen's write. It is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`). Any signed-in account may create (spec Q7): the session is read
 * before the write's transaction opens and checked with `assertSignedIn` inside, after parsing.
 */

/** Creates an Open order with the tenant's next ID, converting the requisitions its lines name (LFC-001, BUY-003). */
export async function createOrder(tenant: string, generation: number, values: unknown): Promise<Result<OrderView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(orderCreateSchema, (input, { cradle }) =>
    cradle.purchaseOrderService.create(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  // A conversion changes the requisitions' list too.
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-orders`, `/admin/${tenant}/purchase-requisitions`);
}
