import { PurchaseOrder, PurchaseOrderLine, PurchaseRequisition, type EntityManager, type Material, type NamedRecord } from "@cpg/db";
import { ConflictError } from "../../http/errors";

import { orderLineState } from "./order-records";

/*
 * What the masters may ask about procurement documents: a leaf module, so `MaterialService` and
 * `LocationService` check it without importing the purchasing services.
 */

/**
 * Refuses deactivating a location that an Open purchase order delivers to, or that an Open requisition
 * needs stock at (LFC-018), naming the lowest one: the order's receipts would be refused with
 * `LOCATION_INACTIVE`, and the requisition could no longer be converted.
 */
export async function assertNoPurchasingAtLocation(em: EntityManager, location: NamedRecord): Promise<void> {
  const order = await em.findOne(PurchaseOrder, { location: location.id, status: "open" }, { orderBy: { code: "asc" } });
  if (order) throw new ConflictError(`Purchase order ${order.code} is still Open for delivery to this location.`, "LOCATION_HAS_PURCHASE_ORDERS", { order: order.code });
  const requisition = await em.findOne(PurchaseRequisition, { location: location.id, status: "open" }, { orderBy: { code: "asc" } });
  if (requisition) {
    throw new ConflictError(`Purchase requisition ${requisition.code} is still Open at this location.`, "LOCATION_HAS_REQUISITIONS", { requisition: requisition.code });
  }
}

/**
 * The ID of the lowest-numbered Open purchase order with a line for `material`; null when none has
 * (LFC-013). Such a material can't be deactivated.
 */
export async function openOrderUsingMaterial(em: EntityManager, material: Material): Promise<string | null> {
  const lines = await em.find(PurchaseOrderLine, { material, status: { $in: ["open", "completed"] } }, { populate: ["order"] });
  // Sorted and filtered here: an `orderBy` or filter on relation fields would add query joins the tenant lint rules don't vet.
  return (
    lines
      .filter((line) => line.order.status === "open" && orderLineState(line) === "open")
      .map(({ order }) => order.code)
      .sort()[0] ?? null
  );
}

/**
 * Whether any purchase requisition or purchase-order line holds a quantity of `material`. Such
 * quantities are stored in its base unit, so the base unit can never change (spec Q10).
 */
export async function hasProcurementDocuments(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(PurchaseRequisition, { material })) > 0 || (await em.count(PurchaseOrderLine, { material })) > 0;
}
