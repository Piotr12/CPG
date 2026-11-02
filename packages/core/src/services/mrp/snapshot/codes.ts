import { Location, Material, type EntityManager } from "@cpg/db";
import type { MaterialType } from "../../../validators/materials/material-fields.schema";

/** Business IDs by primary key: the engine sees materials and locations only by their codes (#273). */
export interface SnapshotCodes {
  materials: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
  /** Each material's type by primary key, for the raw-is-Buy rule at sizing (R02, #278). */
  materialTypes: ReadonlyMap<string, MaterialType>;
  /** The primary keys of the inactive materials: a BOM or a pinned revision with one is unusable or at risk (E17-S02, E17-S03). */
  inactiveMaterials: ReadonlySet<string>;
}

/** Every material and location of the tenant, active or not (spec Q5), as `id → code`, in one partial read each. */
export async function readCodes(em: EntityManager): Promise<SnapshotCodes> {
  const materials = await em.find(Material, {}, { fields: ["code", "type", "active"], disableIdentityMap: true });
  const locations = await em.find(Location, {}, { fields: ["code"], disableIdentityMap: true });
  return {
    materials: new Map(materials.map(({ id, code }) => [id, code])),
    locations: new Map(locations.map(({ id, code }) => [id, code])),
    materialTypes: new Map(materials.map(({ id, type }) => [id, type])),
    inactiveMaterials: new Set(materials.filter(({ active }) => !active).map(({ id }) => id)),
  };
}
