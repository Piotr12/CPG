import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { BomRevision } from "./bom-revision.entity";
import { noUpdateTriggers } from "./immutable-triggers";

const owned = tenantOwned();

/**
 * One line of a revision: a raw or intermediate `material` and the `quantity` of it needed for one
 * base unit of the output, in the material's base unit with six decimals (R03). The entered
 * quantity, unit and factor are kept as entered (MAT-019), so a later conversion change never
 * revalues the line (MAT-027). One line per material and revision; never updated (triggers).
 */
export const BomComponent = defineEntity({
  name: "BomComponent",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    revision: () => p.manyToOne(BomRevision),
    /** The line's place in the recipe as entered; display only. */
    position: p.integer(),
    material: () => p.manyToOne(Material).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
  },
  uniques: [{ properties: ["revision", "material"] }],
  triggers: noUpdateTriggers("bom_component"),
});

export type BomComponent = InferEntity<typeof BomComponent>;
