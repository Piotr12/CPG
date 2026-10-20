import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const CALENDAR_DATE_LENGTH = 10;

/** What a purchase requisition can be so far: converted in full, or not yet (E11 adds the rest). */
export const REQUISITION_STATUSES = ["open", "completed"] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

const owned = tenantOwned();

/**
 * A need to buy `quantity` of one `material` at one `location` by `requiredDate` (E09-S01, BUY-001…004).
 * `code` is its business ID: eight digits, sequential per tenant, never reused; requisitions are
 * never deleted. The quantity is six-decimal base-unit text (R03) with the entered quantity, unit
 * and factor kept (MAT-019). `converted` is how much purchase-order lines have taken so far, in the
 * same form; it reaches `quantity` exactly when the status becomes `completed`. A requisition is
 * planned supply only: it never touches stock (BUY-009).
 */
export const PurchaseRequisition = defineEntity({
  name: "PurchaseRequisition",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    material: () => p.manyToOne(Material).index(),
    location: () => p.manyToOne(Location),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    requiredDate: p.string().length(CALENDAR_DATE_LENGTH),
    converted: p.string(),
    status: p.string().length(9).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Optimistic-lock version (AUD-024, API-029): an edit and a conversion advance it. */
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
});

export type PurchaseRequisition = InferEntity<typeof PurchaseRequisition>;
