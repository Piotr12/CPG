import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { Bom } from "./bom.entity";
import { noUpdateTriggers } from "./immutable-triggers";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const ISO_DATE_LENGTH = 10;

const owned = tenantOwned();

/**
 * One immutable recipe snapshot of a BOM (R04): its number (1, 2, …), priority (1 is the highest),
 * and inclusive validity, from `validFrom` through `validThrough` (null: no end). Its lines are
 * `BomComponent`s. Rows are only ever inserted; the triggers abort any update. Production orders
 * (slice 2) will pin a revision by its `id`.
 */
export const BomRevision = defineEntity({
  name: "BomRevision",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    bom: () => p.manyToOne(Bom),
    number: p.integer(),
    priority: p.integer(),
    validFrom: p.string().length(ISO_DATE_LENGTH),
    validThrough: p.string().length(ISO_DATE_LENGTH).nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
  uniques: [{ properties: ["bom", "number"] }],
  triggers: noUpdateTriggers("bom_revision"),
});

export type BomRevision = InferEntity<typeof BomRevision>;
