import { ProductionOrder, type DocumentState, type EntityManager } from "@cpg/db";
import { productionOutstanding } from "../../domain/production-orders/production-completion";
import { NotFoundError } from "../../http/errors";

export const PRODUCTION_POPULATE = ["output", "location", "recipe.bom"] as const;
export async function findProductionOrder(em: EntityManager, id: string, options: { refresh?: boolean } = {}) {
  const order = await em.findOne(ProductionOrder, { code: id }, { populate: [...PRODUCTION_POPULATE], ...options });
  if (!order) throw new NotFoundError("PRODUCTION_ORDER_NOT_FOUND", `There is no production order ${id} in this tenant.`);
  return order;
}
/** Explicit scalar view doubles as an audit allowlist; never serialize ORM internals. */
export function productionOrderView(order: ProductionOrder) {
  const { code, output, location, recipe, quantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedFinish, plannedStart, leadTimeDays, produced, abandoned, status, createdAt, updatedAt, version } = order;
  return { id: code, output: output.code, location: location.code, bom: recipe.bom.code, revision: recipe.number,
    quantity, enteredQuantity, enteredUnit, numerator, denominator, plannedFinish, plannedStart, leadTimeDays,
    produced, outstanding: productionOutstanding(quantity, produced), abandoned, status: status as DocumentState, createdAt, updatedAt, version };
}
export type ProductionOrderView = ReturnType<typeof productionOrderView>;
export function productionSnapshot(order: ProductionOrder) {
  const { id, output, location, bom, revision, quantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedFinish, plannedStart, leadTimeDays, produced, abandoned, status } = productionOrderView(order);
  return { id, output, location, bom, revision, quantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedFinish, plannedStart, leadTimeDays, produced, abandoned, status };
}
export function productionSubject(order: ProductionOrder) {
  return { type: "ProductionOrder", id: order.code, label: `${order.code} — ${order.output.code} ${order.output.description}` };
}
