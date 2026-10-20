import { randomUUID } from "node:crypto";
import { StockBalance, StockMovement, type EntityManager } from "@cpg/db";
import type { z } from "zod";
import { DEMO_STOCK } from "../../domain/stock/demo-stock";
import { formatSignedQuantity, parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { formatDecimal, MAX_QUANTITY, parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { stockCorrectionSchema, stockPairSchema, stockPostingSchema } from "../../validators/stock/stock-correction.schema";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { AuditActor } from "../audit/actor";
import { activeDemoReferences, isUntouchedKind } from "../demo/demo-references";
import { findActiveLocation, findLocation } from "../locations/find-location";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial, findMaterial } from "../materials/find-material";

export type StockLine = z.infer<typeof stockCorrectionSchema>;
export type StockPair = z.infer<typeof stockPairSchema>;
export interface StockMovementView {
  id: string; postingId: string; position: number; type: string;
  material: string; location: string; businessDate: string; occurredAt: Date;
  quantity: string; baseUnit: string; enteredQuantity: string; enteredUnit: string;
  numerator: string; denominator: string; balanceBefore: string; balanceAfter: string;
  reason: string; actorUserId: string | null; actorUsername: string; channel: "ui" | "api" | "seed";
}
export interface StockView extends StockPair {
  materialDescription: string; locationName: string; baseUnit: string;
  materialActive: boolean; locationActive: boolean; quantity: string; movements: StockMovementView[];
}

type PostingContext = { kind: "user"; actor: AuditActor } | { kind: "seed" };

/** Physical stock for one tenant. All writes, snapshots and audit share one transaction (R03/R05/R08/R09). */
export class StockService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  /** A missing pair means exact zero; inactive masters and their immutable history stay readable. */
  async get(input: StockPair): Promise<StockView> {
    const em = this.em;
    const key = parseInput(stockPairSchema, input);
    const material = await findMaterial(em, key.material);
    const location = await findLocation(em, key.location);
    const balance = await em.findOne(StockBalance, { material, location }, { refresh: true });
    const movements = await em.find(StockMovement, { material, location }, { orderBy: { occurredAt: "desc", id: "desc" }, limit: 100 });
    return {
      ...key, materialDescription: material.description, locationName: location.name, baseUnit: material.baseUnit,
      materialActive: material.active, locationActive: location.active, quantity: balance?.quantity ?? "0.000000",
      movements: movements.map(toView),
    };
  }

  /** The public correction path accepts only the allowlisted user input, never source/date/actor. */
  async correct(raw: unknown, actor: AuditActor): Promise<StockMovementView> {
    const { reason, ...line } = parseInput(stockCorrectionSchema, raw);
    return (await this.post({ lines: [line], reason }, { type: "correction", id: randomUUID() }, actor))[0];
  }

  /** Trusted document callers share one atomic posting primitive; current HTTP exposes only correct(). */
  async post(raw: z.infer<typeof stockPostingSchema>, source: { type: string; id: string }, actor: AuditActor): Promise<StockMovementView[]> {
    const input = parseInput(stockPostingSchema, raw);
    return this.em.transactional((em) => this.write(em, input, source, { kind: "user", actor }));
  }

  /** Installation openings use the same ledger/balance primitive with explicit non-user provenance. */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if (!(await isUntouchedKind(em, await em.count(StockMovement, {}), "stock"))) return 0;
      const references = await activeDemoReferences(em, DEMO_STOCK);
      const lines = DEMO_STOCK.filter((line) => references.material.get(line.material)?.baseUnit === line.unit && references.location.has(line.location));
      if (lines.length === 0) return 0;
      return (await this.write(em, { lines, reason: "Demonstration opening balance" }, { type: "correction", id: randomUUID() }, { kind: "seed" })).length;
    });
  }

  private async write(
    em: EntityManager,
    input: z.infer<typeof stockPostingSchema>,
    source: { type: string; id: string },
    context: PostingContext,
  ): Promise<StockMovementView[]> {
    const businessDate = new Date().toISOString().slice(0, 10);
    const pairs = new Map<string, { balance: StockBalance; quantity: bigint }>();
    const pending: StockMovement[] = [];
    // Validate every cumulative pair balance before the one flush. A later positive line never
    // legitimizes an earlier overdraw, and a failed line leaves the whole group uncommitted.
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
    return pending.map(toView);
  }
}

function toView(movement: StockMovement): StockMovementView {
  const { id, postingId, position, type, material, location, businessDate, occurredAt, quantity, baseUnit,
    enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason, actorUsername, channel } = movement;
  return { id, postingId, position, type, material: material.code, location: location.code, businessDate, occurredAt,
    quantity, baseUnit, enteredQuantity, enteredUnit, numerator, denominator, balanceBefore, balanceAfter, reason,
    actorUserId: movement.actorUserId ?? null, actorUsername, channel };
}
