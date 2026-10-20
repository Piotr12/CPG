import { SafetyStockTarget, type EntityManager, type Material } from "@cpg/db";

/**
 * Whether `material` has a safety-stock target at any location: its base unit holds their quantities.
 * A leaf function, so `MaterialService` checks it without importing `SafetyStockTargetService`.
 */
export async function hasSafetyStockTargets(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(SafetyStockTarget, { material })) > 0;
}
