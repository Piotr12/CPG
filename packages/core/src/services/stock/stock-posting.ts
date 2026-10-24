import { StockBalance, StockMovement, type EntityManager, type Material, type Location } from "@cpg/db";
import type { z } from "zod";
import { formatSignedQuantity, parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { formatDecimal, MAX_QUANTITY, parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError } from "../../http/errors";
import type { stockPostingSchema } from "../../validators/stock/stock-correction.schema";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { AuditActor } from "../audit/actor";
import { locationsByCode, pickActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { materialsByCode, pickActiveMaterial } from "../materials/find-material";

/*
 * The ledger's one posting primitive (stock spec, Architecture): a leaf module, so a document's
 * service (a goods receipt) posts its movements in its own transaction without importing
 * `StockService`.
 */

export type StockPosting = z.infer<typeof stockPostingSchema>;

/** The movement type of a reasoned correction: a manual one, a demo opening, or a stock import's (INV-016). */
export const CORRECTION_MOVEMENT = "correction";

/** The movement type of an exact historical inverse, whatever its original's document. */
export const REVERSAL_MOVEMENT = "reversal";

export interface StockMovementView {
  id: string; postingId: string; position: number; type: string;
  material: string; location: string; businessDate: string; occurredAt: Date;
  quantity: string; baseUnit: string; enteredQuantity: string; enteredUnit: string;
  numerator: string; denominator: string; balanceBefore: string; balanceAfter: string;
  reason: string; actorUserId: string | null; actorUsername: string; channel: "ui" | "api" | "seed";
}

/**
 * Who posts: a user, whose every movement is audited and dated now, or the server-only demo seed,
 * which is not audited and posts at the moment `at` it supplies.
 */
export type PostingContext = { kind: "user"; actor: AuditActor } | { kind: "seed"; at: Date };

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
 * (INV-010) for a user; the seed supplies its own date and time. The caller has parsed `input` with `stockPostingSchema` (the public `post`, at most 100
 * lines), or built lines valid by construction: the stock import's nonzero base-unit differences, at
 * most `IMPORT_ROWS_MAX` (stock-import spec Q11). A caller posting one group in several calls on the
 * same transaction (the stock import, in chunks) numbers each call's lines from `firstPosition`.
 */
export async function postStockMovements(
  em: EntityManager,
  input: StockPosting,
  source: PostingSource,
  context: PostingContext,
  { firstPosition = 0 }: { firstPosition?: number } = {},
): Promise<StockMovementView[]> {
  // One query per kind for the whole posting, then checked line by line, in line order, as before (#163, #185).
  const materials = await materialsByCode(em, input.lines.map(({ material }) => material));
  const locations = await locationsByCode(em, input.lines.map(({ location }) => location));
  const resolved: ResolvedStockLine[] = [];
  for (const line of input.lines) {
    const material = pickActiveMaterial(materials, line.material);
    const location = pickActiveLocation(locations, line.location);
    const signed = parseSignedQuantity(line.quantity)!;
    const converted = await convertToBaseQuantity(em, material, { quantity: formatDecimal(signed < 0n ? -signed : signed), unit: line.unit });
    resolved.push({ material, location, signed, converted, delta: parseDecimal(converted.baseQuantity)! * (signed < 0n ? -1n : 1n) });
  }
  return postResolvedStockMovements(em, resolved, input.reason, source, context, firstPosition);
}

interface ResolvedStockLine {
  material: Material;
  location: Location;
  signed: bigint;
  delta: bigint;
  converted: BaseQuantity;
}

/** Inverts immutable base quantity; historical masters need not be active and current conversions are irrelevant. */
export async function postHistoricalInverse(
  em: EntityManager, original: StockMovement, reason: string, postingId: string, actor: AuditActor,
): Promise<StockMovementView> {
  const [movement] = await postHistoricalInverses(em, [original], reason, postingId, actor);
  return movement;
}

/**
 * Inverts every original as one `reversal` group, position for position: a production completion's
 * output and inputs together. Every balance is checked before the one flush, so a single short line
 * (the finished output, REV-012) writes nothing at all. Caller owns the transaction.
 */
export async function postHistoricalInverses(
  em: EntityManager, originals: readonly StockMovement[], reason: string, postingId: string, actor: AuditActor,
): Promise<StockMovementView[]> {
  const lines = originals.map((original): ResolvedStockLine => {
    const quantity = parseSignedQuantity(original.quantity);
    if (quantity === null || quantity === 0n || original.baseUnit !== original.material.baseUnit) {
      throw new ConflictError("The original movement no longer matches its recorded base quantity and unit.", "STOCK_REVERSAL_INCONSISTENT");
    }
    const inverse = -quantity;
    return {
      material: original.material, location: original.location, signed: inverse, delta: inverse,
      converted: { baseQuantity: formatDecimal(inverse < 0n ? -inverse : inverse), enteredQuantity: formatSignedQuantity(inverse),
        enteredUnit: original.baseUnit, numerator: "1", denominator: "1" },
    };
  });
  return postResolvedStockMovements(em, lines, reason, { type: REVERSAL_MOVEMENT, id: postingId }, { kind: "user", actor }, 0);
}

/** Both new postings and historical inverses use the same balance, range and audit rules. Caller owns the transaction. */
async function postResolvedStockMovements(
  em: EntityManager, lines: readonly ResolvedStockLine[], reason: string, source: PostingSource, context: PostingContext, firstPosition: number,
): Promise<StockMovementView[]> {
  const businessDate = (context.kind === "seed" ? context.at : new Date()).toISOString().slice(0, 10);
  const balances = await currentBalances(em, lines);
  const pairs = new Map<string, { balance: StockBalance; quantity: bigint }>();
  const pending: StockMovement[] = [];
  for (const [position, { material, location, signed, delta, converted }] of lines.entries()) {
    const line = { material: material.code, location: location.code };
    const key = pairKey(material, location);
    let pair = pairs.get(key);
    if (!pair) {
      const balance = balances.get(key);
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
      postingId: source.id, position: firstPosition + position, type: source.type, material, location, businessDate,
      quantity: formatSignedQuantity(delta), baseUnit: material.baseUnit,
      enteredQuantity: formatSignedQuantity(signed), enteredUnit: converted.enteredUnit,
      numerator: converted.numerator, denominator: converted.denominator,
      balanceBefore: formatDecimal(before, { fixed: true }), balanceAfter: pair.balance.quantity,
      reason, ...(context.kind === "seed" && { occurredAt: context.at }), actorUserId: actor?.userId ?? null, actorUsername: actor?.username ?? "Demo seed", channel: actor?.channel ?? "seed",
    });
    pending.push(movement);
    if (actor) recordTenantAudit(em, actor, {
      action: "stock.movement.posted",
      subject: { type: "StockMovement", id: movement.id, label: `${line.material} — ${material.description} at ${line.location} — ${location.name}` },
      before: { quantity: movement.balanceBefore },
      after: {
        quantity: movement.balanceAfter, movement: movement.quantity, material: line.material, location: line.location,
        postingId: source.id, type: source.type, businessDate, reason,
        enteredQuantity: movement.enteredQuantity, enteredUnit: movement.enteredUnit, numerator: movement.numerator, denominator: movement.denominator,
      },
    });
  }
  await em.flush();
  return pending.map(toMovementView);
}

function pairKey(material: Material, location: Location): string {
  return `${material.id}/${location.id}`;
}

/** The stored balances of the lines' pairs, fresh, keyed by `pairKey`, in one query; a pair without one is absent. */
async function currentBalances(em: EntityManager, lines: readonly ResolvedStockLine[]): Promise<Map<string, StockBalance>> {
  if (lines.length === 0) return new Map();
  const balances = await em.find(StockBalance, { $or: lines.map(({ material, location }) => ({ material, location })) }, { refresh: true });
  return new Map(balances.map((balance) => [pairKey(balance.material, balance.location), balance]));
}

export function toMovementView(movement: StockMovement): StockMovementView {
  const { id, postingId, position, type, material, location, businessDate, occurredAt, quantity, baseUnit,
    enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason, actorUsername, channel } = movement;
  return { id, postingId, position, type, material: material.code, location: location.code, businessDate, occurredAt,
    quantity, baseUnit, enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason,
    actorUserId: movement.actorUserId ?? null, actorUsername, channel };
}
