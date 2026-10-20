import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

const owned = tenantOwned();

/**
 * A logical BOM in one tenant (R05): a stable alternative recipe for one intermediate or finished
 * `output` (R02). `code` is its business ID, eight digits assigned in sequence per tenant and never
 * changed; BOMs are never deleted. The recipe lives in immutable `BomRevision`s; `revision` is the
 * number of the current one. Toggling `active` never creates a revision (R04, BOM-022).
 */
export const Bom = defineEntity({
  name: "Bom",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    output: () => p.manyToOne(Material).index(),
    active: p.boolean().default(true),
    revision: p.integer(),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Optimistic-lock version (AUD-024, API-029): advances with every revision and toggle. */
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
});

export type Bom = InferEntity<typeof Bom>;
