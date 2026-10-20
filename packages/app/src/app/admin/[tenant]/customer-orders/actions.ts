"use server";

import { assertSignedIn, tenantServerAction, uiActor, type CustomerOrderView, type Result } from "@cpg/core";
import { customerOrderCreateSchema, customerOrderUpdateActionSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/** Session, generation, read-only and audit checks match the API; both roles maintain transactions. */
export async function createCustomerOrder(tenant: string, generation: number, values: unknown): Promise<Result<CustomerOrderView>> {
  const user = await currentUser();
  const result = await tenantServerAction(customerOrderCreateSchema, (input, { cradle }) =>
    cradle.customerOrderService.create(input, uiActor(assertSignedIn(user))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/customer-orders`);
}

/** The page binds order ID and version; a submitted form cannot substitute them. */
export async function updateCustomerOrder(tenant: string, generation: number, orderId: string, version: number, values: unknown): Promise<Result<CustomerOrderView>> {
  const user = await currentUser();
  const result = await tenantServerAction(customerOrderUpdateActionSchema, ({ orderId, version, ...changes }, { cradle }) =>
    cradle.customerOrderService.update(orderId, changes, version, uiActor(assertSignedIn(user))),
  )(tenant, generation, { ...formValues(values), orderId, version });
  return refreshAfterWrite(result, `/admin/${tenant}/customer-orders`, `/admin/${tenant}/customer-orders/${orderId}`);
}
