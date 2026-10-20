import { StockBalance, StockMovement, type EntityManager } from "@cpg/db";
import type { z } from "zod";
import { formatSignedQuantity, parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { formatDecimal, MAX_QUANTITY, parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError } from "../../http/errors";
import type { stockPostingSchema } from "../../validators/stock/stock-correction.schema";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { AuditActor } from "../audit/actor";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";

/*
 * The ledger's one posting primitive (stock spec, Architecture): a leaf module, so a document's
 * service (a goods receipt) posts its movements in its own transaction without importing
 * `StockService`.
 */

export type StockPosting = z.infer<typeof stockPostingSchema>;

export interface StockMovementView {
  id: string; postingId: string; position: number; type: string;
  material: string; location: string; businessDate: string; occurredAt: Date;
  quantity: string; baseUnit: string; enteredQuantity: string; enteredUnit: string;
  numerator: string; denominator: string; balanceBefore: string; balanceAfter: string;
  reason: string; actorUserId: string | null; actorUsername: string; channel: "ui" | "api" | "seed";
}

/** Who posts: a user, whose every movement is audited, or the server-only demo seed, which is not. */
export type PostingContext = { kind: "user"; actor: AuditActor } | { kind: "seed" };

/** The source document of a posting: its type and the ID every movement of it carries. */
export interface PostingSource {
  type: string;
  id: string;
}

/**
 * Posts `input`'s lines as one group on `em`, which must be in a transaction, and flushes: each
 * line's movement, its pair's balance and (for a user) its audit entry. Every cumulative pair balance
 * is checked before the one flush, so a later positive line never legitimizes an earlier overdraw
 * and a failed line leaves the whole group unwritten (R09). Dated today, the server's UTC date
 * (INV-010). The caller has parsed `input` with `stockPostingSchema`.
 */
export async function postStockMovements(
  em: EntityManager,
  input: StockPosting,
  source: PostingSource,
  context: PostingContext,
): Promise<StockMovementView[]> {
  const businessDate = new Date().toISOString().slice(0, 10);
  const pairs = new Map<string, { balance: StockBalance; quantity: bigint }>();
  const pending: StockMovement[] = [];
  for (const [position, line] of input.lines.entries()) {
    const material = await findActiveMaterial(em, line.material);
    const location = await findActiveLocation(em, line.location);
    const signed = parseSignedQuantity(line.quantity)!;
    const converted = await convertToBaseQuantity(em, material, { quantity: formatDecimal(signed < 0n ? -signed : signed), unit: line.unit });
    const delta = parseDecimal(converted.baseQuantity)! * (signed < 0n ? -1n : 1n);
    const key = `${line.material}/${line.location}`;
    let pair = pairs.get(key);
    if (!pair) {
      const balance = await em.findOne(StockBalance, { material, location }, { refresh: true });
      pair = { balance: balance ?? em.create(StockBalance, { material, location, quantity: "0.000000" }), quantity: parseDecimal(balance?.quantity ?? "0")! };
      pairs.set(key, pair);
    }
    const before = pair.quantity;
    const after = before + delta;
    if (after < 0n) {
      throw new ConflictError(
        `Material ${line.material} at location ${line.location}: available ${formatDecimal(before, { fixed: true })} ${material.baseUnit}; requested ${formatDecimal(-delta, { fixed: true })} ${material.baseUnit}.`,
        "INSUFFICIENT_STOCK",
        { material: line.material, location: line.location, available: formatDecimal(before, { fixed: true }), requested: formatDecimal(-delta, { fixed: true }), unit: material.baseUnit },
      );
    }
    if (after > MAX_QUANTITY) throw new AppError("QUANTITY_OUT_OF_RANGE", "The resulting physical balance is too large to store.");
    pair.quantity = after;
    pair.balance.quantity = formatDecimal(after, { fixed: true });
    const actor = context.kind === "user" ? context.actor : null;
    const movement = em.create(StockMovement, {
      postingId: source.id, position, type: source.type, material, location, businessDate,
      quantity: formatSignedQuantity(delta), baseUnit: material.baseUnit,
      enteredQuantity: formatSignedQuantity(signed), enteredUnit: converted.enteredUnit,
      numerator: converted.numerator, denominator: converted.denominator,
      balanceBefore: formatDecimal(before, { fixed: true }), balanceAfter: pair.balance.quantity,
      reason: input.reason, actorUserId: actor?.userId ?? null, actorUsername: actor?.username ?? "Demo seed", channel: actor?.channel ?? "seed",
    });
    pending.push(movement);
    if (actor) recordTenantAudit(em, actor, {
      action: "stock.movement.posted",
      subject: { type: "StockMovement", id: movement.id, label: `${line.material} — ${material.description} at ${line.location} — ${location.name}` },
      before: { quantity: movement.balanceBefore },
      after: {
        quantity: movement.balanceAfter, movement: movement.quantity, material: line.material, location: line.location,
        postingId: source.id, type: source.type, businessDate, reason: input.reason,
        enteredQuantity: movement.enteredQuantity, enteredUnit: movement.enteredUnit, numerator: movement.numerator, denominator: movement.denominator,
      },
    });
  }
  await em.flush();
  return pending.map(toMovementView);
}

export function toMovementView(movement: StockMovement): StockMovementView {
  const { id, postingId, position, type, material, location, businessDate, occurredAt, quantity, baseUnit,
    enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason, actorUsername, channel } = movement;
  return { id, postingId, position, type, material: material.code, location: location.code, businessDate, occurredAt,
    quantity, baseUnit, enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason,
    actorUserId: movement.actorUserId ?? null, actorUsername, channel };
}
