"use server";

import { assertSignedIn, tenantServerAction, uiActor, type ProductionOrderDetail, type Result } from "@cpg/core";
import { productionOrderCreateSchema, productionOrderUpdateActionSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

export async function createProductionOrder(tenant: string, generation: number, values: unknown): Promise<Result<ProductionOrderDetail>> {
  const user = await currentUser();
  const result = await tenantServerAction(productionOrderCreateSchema, (input, { cradle }) =>
    cradle.productionOrderService.create(input, uiActor(assertSignedIn(user))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/production-orders`);
}
/** IDs and versions are bound when the dialog opens, never replaced by a conflict refresh. */
export async function updateProductionOrder(tenant: string, generation: number, orderId: string, version: number, values: unknown): Promise<Result<ProductionOrderDetail>> {
  const user = await currentUser();
  const result = await tenantServerAction(productionOrderUpdateActionSchema, ({ orderId, version, ...changes }, { cradle }) =>
    cradle.productionOrderService.update(orderId, changes, version, uiActor(assertSignedIn(user))),
  )(tenant, generation, { ...formValues(values), orderId, version });
  return refreshAfterWrite(result, `/admin/${tenant}/production-orders`, `/admin/${tenant}/production-orders/${orderId}`);
}
