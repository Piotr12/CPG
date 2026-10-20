import { StockBalance, StockMovement, type EntityManager, type Material, type NamedRecord } from "@cpg/db";
import { ConflictError } from "../../http/errors";

/** Any history locks the unit/type permanently, including when the current balance is zero. */
export async function hasStockMovements(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(StockMovement, { material })) > 0;
}

/** Runs in the master's edit transaction so a stock posting cannot slip between check and edit. */
export async function assertNoPhysicalStock(em: EntityManager, reference: { material: Material } | { location: NamedRecord }): Promise<void> {
  const balance = await em.findOne(StockBalance, { ...reference, quantity: { $ne: "0.000000" } }, { populate: ["material", "location"], refresh: true });
  if (balance) {
    throw new ConflictError(
      `Material ${balance.material.code} at location ${balance.location.code} holds ${balance.quantity} ${balance.material.baseUnit}. Clear its stock before deactivation.`,
      "STOCK_NOT_EMPTY",
      { material: balance.material.code, location: balance.location.code, quantity: balance.quantity, unit: balance.material.baseUnit },
    );
  }
}
