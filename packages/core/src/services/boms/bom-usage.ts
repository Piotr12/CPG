import { Bom, BomComponent, type EntityManager, type Material } from "@cpg/db";

/*
 * What the materials concept may ask about BOMs: a leaf function, so `MaterialService` checks it
 * without importing `BomService` (which imports the material lookups).
 */

/**
 * The ID of a BOM that references `material`, as its output or as a component of any revision,
 * current or historic, active or inactive; null when none does. Such a material's type and base
 * unit can never change again (R02, MAT-011, MAT-030): revisions are never removed.
 */
export async function bomUsingMaterial(em: EntityManager, material: Material): Promise<string | null> {
  const asOutput = await em.findOne(Bom, { output: material }, { orderBy: { code: "asc" } });
  if (asOutput) return asOutput.code;
  // Sorted here: an `orderBy` on relation fields would add query joins the tenant lint rules don't vet.
  const asComponent = await em.find(BomComponent, { material }, { populate: ["revision.bom"] });
  return asComponent.map(({ revision }) => revision.bom.code).sort()[0] ?? null;
}
