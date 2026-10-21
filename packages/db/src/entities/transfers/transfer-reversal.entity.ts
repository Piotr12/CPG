import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { Transfer } from "./transfer.entity";
import { TransferPosting } from "./transfer-posting.entity";

/** What the trigger says when anything tries to change a transfer reversal. */
export const TRANSFER_REVERSAL_IMMUTABLE = "Transfer reversals are immutable";

const owned = tenantOwned();

/**
 * The full, once-only reversal of one dispatch, receipt or write-off on a `transfer` (E11-S03): the
 * transit leg of the reversal, posted on `businessDate` (the server's UTC date). `quantity` is the
 * original's positive base quantity; `transitBefore`/`transitAfter` the transfer's in-transit quantity
 * around it. A dispatch's or receipt's physical leg is the `reversal` stock movement whose `postingId`
 * is this `id`, linked to the original movement by `StockReversal`; a write-off has none. Unique per
 * original and immutable: the original posting is never rewritten. The Test reset may still delete rows.
 */
export const TransferReversal = defineEntity({
  name: "TransferReversal",
  filters: owned.filters,
  properties: {
    // Always given: the service generates it first, because the physical inverse movement carries it.
    id: p.uuid().primary(),
    tenant: owned.tenant,
    transfer: () => p.manyToOne(Transfer),
    original: () => p.manyToOne(TransferPosting),
    businessDate: p.string().length(10),
    occurredAt: p.datetime().onCreate(() => new Date()),
    quantity: p.string(),
    transitBefore: p.string(),
    transitAfter: p.string(),
    reason: p.string().length(500),
    actorUserId: p.string().nullable(),
    actorUsername: p.string(),
    channel: p.enum(["ui", "api"]),
  },
  uniques: [{ properties: ["tenant", "original"] }],
  indexes: [{ properties: ["transfer", "occurredAt"] }],
  triggers: [
    {
      name: "transfer_reversal_no_update",
      timing: "before",
      events: ["update"],
      body: `select raise(abort, '${TRANSFER_REVERSAL_IMMUTABLE}');`,
    },
  ],
});

export type TransferReversal = InferEntity<typeof TransferReversal>;
