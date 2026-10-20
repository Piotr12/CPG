import { randomUUID } from "node:crypto";
import { StockBalance, StockMovement, type EntityManager } from "@cpg/db";
import type { z } from "zod";
import { DEMO_STOCK } from "../../domain/stock/demo-stock";
import { parseInput } from "../../http/parse-input";
import { stockCorrectionSchema, stockPairSchema, stockPostingSchema } from "../../validators/stock/stock-correction.schema";
import type { AuditActor } from "../audit/actor";
import { activeDemoReferences, isUntouchedKind } from "../demo/demo-references";
import { findLocation } from "../locations/find-location";
import { findMaterial } from "../materials/find-material";
import { transitAt } from "../transfers/transfer-usage";
import { CORRECTION_MOVEMENT, postStockMovements, toMovementView, type PostingSource, type StockMovementView } from "./stock-posting";

export type { StockMovementView };
export type StockLine = z.infer<typeof stockCorrectionSchema>;
export type StockPair = z.infer<typeof stockPairSchema>;
export interface StockView extends StockPair {
  materialDescription: string; locationName: string; baseUnit: string;
  materialActive: boolean; locationActive: boolean; quantity: string;
  /** In transit on Open transfers from and to this location: the transfers', usable at neither site (UX-017, INV-009). */
  inTransitFrom: string; inTransitTo: string;
  /** The IDs of the Open transfers holding that transit, ascending. */
  transitTransfers: string[];
  movements: StockMovementView[];
}

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
    const transit = await transitAt(em, material, location);
    return {
      ...key, materialDescription: material.description, locationName: location.name, baseUnit: material.baseUnit,
      materialActive: material.active, locationActive: location.active, quantity: balance?.quantity ?? "0.000000",
      inTransitFrom: transit.from, inTransitTo: transit.to, transitTransfers: transit.transfers,
      movements: movements.map(toMovementView),
    };
  }

  /** The public correction path accepts only the allowlisted user input, never source/date/actor. */
  async correct(raw: unknown, actor: AuditActor): Promise<StockMovementView> {
    const { reason, ...line } = parseInput(stockCorrectionSchema, raw);
    return (await this.post({ lines: [line], reason }, { type: CORRECTION_MOVEMENT, id: randomUUID() }, actor))[0];
  }

  /** A trusted caller's group posted in its own transaction; a document posting in its own transaction calls `postStockMovements`. */
  async post(raw: z.infer<typeof stockPostingSchema>, source: PostingSource, actor: AuditActor): Promise<StockMovementView[]> {
    const input = parseInput(stockPostingSchema, raw);
    return this.em.transactional((em) => postStockMovements(em, input, source, { kind: "user", actor }));
  }

  /** Installation openings use the same ledger/balance primitive with explicit non-user provenance. */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if (!(await isUntouchedKind(em, await em.count(StockMovement, {}), "stock"))) return 0;
      const references = await activeDemoReferences(em, DEMO_STOCK);
      const lines = DEMO_STOCK.filter((line) => references.material.get(line.material)?.baseUnit === line.unit && references.location.has(line.location));
      if (lines.length === 0) return 0;
      return (await postStockMovements(em, { lines, reason: "Demonstration opening balance" }, { type: CORRECTION_MOVEMENT, id: randomUUID() }, { kind: "seed" })).length;
    });
  }
}
