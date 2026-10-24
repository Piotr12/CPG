import { Material, type EntityManager } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";

/** A material this tenant doesn't have: an unknown ID, or another tenant's (TEN-014). */
export function materialNotFound(materialId: string): NotFoundError {
  return new NotFoundError("MATERIAL_NOT_FOUND", `There is no material ${materialId} in this tenant.`);
}

/**
 * The material with business ID `materialId` in `em`'s tenant, or `MATERIAL_NOT_FOUND`. A leaf
 * module, so the services that reference materials can load them without importing
 * `MaterialService`. `refresh` re-reads a row already in the identity map, for a version check.
 */
export async function findMaterial(em: EntityManager, materialId: string, options: { refresh?: boolean } = {}): Promise<Material> {
  const material = await em.findOne(Material, { code: materialId }, options);
  if (!material) throw materialNotFound(materialId);
  return material;
}

/**
 * `findMaterial` for a new entry that references the material: an inactive one can't be picked
 * (MAT-029), so it is `MATERIAL_INACTIVE`. Entries made before the deactivation stay valid.
 */
export async function findActiveMaterial(em: EntityManager, materialId: string): Promise<Material> {
  return assertMaterialActive(await findMaterial(em, materialId));
}

/** The materials with business IDs `materialIds` in `em`'s tenant, keyed by ID, in one query; an ID it doesn't have is absent. */
export async function materialsByCode(em: EntityManager, materialIds: readonly string[]): Promise<Map<string, Material>> {
  return new Map((await em.find(Material, { code: { $in: [...new Set(materialIds)] } })).map((material) => [material.code, material]));
}

/** `findActiveMaterial` over materials loaded by `materialsByCode`, with the same errors. */
export function pickActiveMaterial(materials: ReadonlyMap<string, Material>, materialId: string): Material {
  const material = materials.get(materialId);
  if (!material) throw materialNotFound(materialId);
  return assertMaterialActive(material);
}

function assertMaterialActive(material: Material): Material {
  if (!material.active) {
    throw new ConflictError(`Material ${material.code} is inactive, so it can't be picked for new entries.`, "MATERIAL_INACTIVE");
  }
  return material;
}
