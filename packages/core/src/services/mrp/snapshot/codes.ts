import { Location, Material, type EntityManager } from "@cpg/db";

/** Business IDs by primary key: the engine sees materials and locations only by their codes (#273). */
export interface SnapshotCodes {
  materials: ReadonlyMap<string, string>;
  locations: ReadonlyMap<string, string>;
}

/** Every material and location of the tenant, active or not (spec Q5), as `id → code`, in one partial read each. */
export async function readCodes(em: EntityManager): Promise<SnapshotCodes> {
  const options = { fields: ["code"], disableIdentityMap: true } as const;
  const materials = await em.find(Material, {}, options);
  const locations = await em.find(Location, {}, options);
  return {
    materials: new Map(materials.map(({ id, code }) => [id, code])),
    locations: new Map(locations.map(({ id, code }) => [id, code])),
  };
}
