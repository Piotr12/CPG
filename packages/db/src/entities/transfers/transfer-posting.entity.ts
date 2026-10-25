import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { Transfer } from "./transfer.entity";

/** What one posting on a transfer does: dispatch (+transit), receipt (−transit) or write-off (−transit). */
export const TRANSFER_POSTING_KINDS = ["dispatch", "receipt", "write-off"] as const;
export type TransferPostingKind = (typeof TRANSFER_POSTING_KINDS)[number];

/** What the trigger says when anything tries to change a posting. */
export const TRANSFER_POSTING_IMMUTABLE = "Transfer postings are immutable";

const owned = tenantOwned();

/**
 * One dispatch, receipt or write-off on a `transfer` (TRF-004…007, TRF-013): the in-transit leg of
 * the ledger, posted on `businessDate` (the server's UTC date, INV-010). `quantity` is the positive
 * six-decimal base quantity it moved, with the entered quantity, unit and factor kept (MAT-019);
 * `transitBefore` and `transitAfter` are the transfer's in-transit quantity around it. A dispatch's
 * or a receipt's physical leg is the `StockMovement` whose `postingId` is this posting's `id`.
 * Immutable: a reversal (E11-S03) will append, never rewrite. The Test reset may still delete rows.
 */
export const TransferPosting = defineEntity({
  name: "TransferPosting",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    transfer: () => p.manyToOne(Transfer),
    kind: p.enum(TRANSFER_POSTING_KINDS),
    businessDate: p.string().length(10),
    occurredAt: p.datetime().onCreate(() => new Date()),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    transitBefore: p.string(),
    transitAfter: p.string(),
    reason: p.string().length(500),
    actorUserId: p.string().nullable(),
    actorUsername: p.string(),
    channel: p.enum(["ui", "api"]),
  },
  indexes: [
    { properties: ["transfer", "occurredAt"] },
    /** Serve the stock ledger's source read, `id IN (…)`, which SQLite would plan through the tenant alone (#257). */
    { properties: ["tenant", "id"] },
  ],
  triggers: [
    {
      name: "transfer_posting_no_update",
      timing: "before",
      events: ["update"],
      body: `select raise(abort, '${TRANSFER_POSTING_IMMUTABLE}');`,
    },
  ],
});

export type TransferPosting = InferEntity<typeof TransferPosting>;
