"use server";

import { assertSignedIn, tenantServerAction, uiActor, type CompletionResult, type ProductionOrderDetail, type Result } from "@cpg/core";
import { productionCompletionActionSchema } from "@cpg/core/validators/production-orders/production-completion.schema";
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
/**
 * The order and the dialog's submission token are bound when the dialog opens: a double submit or a
 * retried action sends the same token and posts once (spec Q7). Refreshes the order, the list and stock.
 */
export async function postProductionCompletion(tenant: string, generation: number, orderId: string, submission: string, values: unknown): Promise<Result<CompletionResult>> {
  const user = await currentUser();
  const result = await tenantServerAction(productionCompletionActionSchema, ({ order, submission, ...input }, { cradle }) =>
    cradle.productionCompletionService.post(order, input, uiActor(assertSignedIn(user)), { submission }),
  )(tenant, generation, { ...formValues(values), order: orderId, submission });
  return refreshAfterWrite(result, `/admin/${tenant}/production-orders`, `/admin/${tenant}/production-orders/${orderId}`, `/admin/${tenant}/stock`);
}
