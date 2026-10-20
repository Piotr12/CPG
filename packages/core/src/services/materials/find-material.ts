import { Material, type EntityManager } from "@cpg/db";
import { NotFoundError } from "../../http/errors";

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
