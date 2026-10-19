import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";

/** The three material types (R02): raw is Buy-only, finished is never a BOM component. */
export const MATERIAL_TYPES = ["raw", "intermediate", "finished"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

/** Longest description and unit code (spec Q2, Q11). */
export const MATERIAL_DESCRIPTION_MAX = 200;
export const MATERIAL_UNIT_MAX = 16;

const owned = tenantOwned();

/**
 * A material in one tenant (R05). `code` is its business ID: eight digits assigned in sequence per
 * tenant from `00000001` and never changed or reused (R01); the UUID never leaves `core`. Every
 * authoritative quantity of the material is in `baseUnit` (R03). Materials are never deleted, only
 * deactivated.
 */
export const Material = defineEntity({
  name: "Material",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    type: p.enum(MATERIAL_TYPES),
    description: p.string().length(MATERIAL_DESCRIPTION_MAX),
    baseUnit: p.string().length(MATERIAL_UNIT_MAX),
    active: p.boolean().default(true),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Optimistic-lock version (AUD-024, API-029): an edit carries the one it loaded. */
    version: p.integer().version(),
  },
  // Tenant-local business key: Test and Prod each have their own 00000001 (MAT-003, TEN-012).
  uniques: [{ properties: ["tenant", "code"] }],
});

export type Material = InferEntity<typeof Material>;
