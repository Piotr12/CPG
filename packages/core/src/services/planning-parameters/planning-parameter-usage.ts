import { PlanningParameterSet, type EntityManager, type Material } from "@cpg/db";

/*
 * What the materials concept may ask about planning parameters: leaf functions, so `MaterialService`
 * checks them without importing `PlanningParameterService` (which imports the material lookups).
 */

/** Whether `material` has a parameter set at any location: its base unit holds their quantities. */
export async function hasPlanningParameters(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(PlanningParameterSet, { material })) > 0;
}

/** Whether `material` is made at any location, which a raw material may never be (R02). */
export async function isMadeAnywhere(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(PlanningParameterSet, { material, procurement: "make" })) > 0;
}
