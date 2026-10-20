import { PurchaseOrderLine, PurchaseRequisition, type EntityManager, type Material } from "@cpg/db";

/*
 * What the materials concept may ask about procurement documents: a leaf module, so
 * `MaterialService` checks it without importing the purchasing services.
 */

/**
 * The ID of the lowest-numbered Open purchase order with a line for `material`; null when none has
 * (LFC-013). Such a material can't be deactivated.
 */
export async function openOrderUsingMaterial(em: EntityManager, material: Material): Promise<string | null> {
  const lines = await em.find(PurchaseOrderLine, { material }, { populate: ["order"] });
  // Sorted and filtered here: an `orderBy` or filter on relation fields would add query joins the tenant lint rules don't vet.
  return (
    lines
      .filter(({ order }) => order.status === "open")
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
