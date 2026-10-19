import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { Material, MATERIAL_UNIT_MAX } from "./material.entity";

const owned = tenantOwned();

/**
 * How one alternate unit of a material converts into its base unit: `1 unit = numerator /
 * denominator` base units. Both are exact positive decimals stored as text, never a binary float
 * (R03); SQLite's numeric affinity would turn `0.333333` into a REAL. Anything stored from an
 * entered quantity keeps its own copy of the unit and factor, so changing or removing a conversion
 * never revalues it (MAT-027).
 */
export const MaterialConversion = defineEntity({
  name: "MaterialConversion",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    material: () => p.manyToOne(Material),
    unit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["material", "unit"] }],
});

export type MaterialConversion = InferEntity<typeof MaterialConversion>;
