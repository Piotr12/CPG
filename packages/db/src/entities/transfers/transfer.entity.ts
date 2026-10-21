import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { DOCUMENT_STATES } from "../customer-orders/customer-order.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const CALENDAR_DATE_LENGTH = 10;

/** The shared four-state lifecycle; losses resolve as Closed Early. */
export const TRANSFER_STATUSES = DOCUMENT_STATES;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** Room for the longest status E11 will add, `closed-early`. */
const STATUS_LENGTH = 12;

const owned = tenantOwned();

/**
 * A plan to move `quantity` of one `material` from `source` to a different `destination` (E07-S03,
 * TRF-001, TRF-002), leaving on `plannedDispatch` and arriving on `plannedArrival`, never earlier.
 * `code` is its business ID: eight digits, sequential per tenant, never reused; transfers are never
 * deleted. Quantities are six-decimal base-unit text (R03), with the entered quantity, unit and
 * factor kept (MAT-019). `dispatched`, `received` and `writtenOff` are what its postings
 * (`TransferPosting`) have moved so far; what is in transit is `dispatched − received − writtenOff`,
 * derived so it can't drift, and belongs to the transfer, never to a location.
 */
export const Transfer = defineEntity({
  name: "Transfer",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    material: () => p.manyToOne(Material).index(),
    source: () => p.manyToOne(Location).index(),
    destination: () => p.manyToOne(Location).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    plannedDispatch: p.string().length(CALENDAR_DATE_LENGTH),
    plannedArrival: p.string().length(CALENDAR_DATE_LENGTH),
    dispatched: p.string().default("0.000000"),
    received: p.string().default("0.000000"),
    writtenOff: p.string().default("0.000000"),
    abandoned: p.string().default("0.000000"),
    status: p.string().length(STATUS_LENGTH).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Set on every change, so the version advances with the transfer's progress too. */
    updatedAt: p.datetime().onCreate(() => new Date()),
    /** Optimistic-lock version (AUD-024, API-029): a date edit and every posting advance it. */
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
});

export type Transfer = InferEntity<typeof Transfer>;
