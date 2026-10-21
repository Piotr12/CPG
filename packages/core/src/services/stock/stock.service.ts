import { randomUUID } from "node:crypto";
import { StockBalance, StockMovement, type EntityManager } from "@cpg/db";
import type { z } from "zod";
import { parseInput } from "../../http/parse-input";
import { NotFoundError } from "../../http/errors";
import { stockMovementIdSchema } from "../../validators/stock/stock-reversal.schema";
import { STOCK_LEDGER_PAGE_SIZE, stockCorrectionSchema, stockLedgerQuerySchema, stockPairSchema, stockPostingSchema } from "../../validators/stock/stock-correction.schema";
import type { AuditActor } from "../audit/actor";
import { findLocation } from "../locations/find-location";
import { findMaterial } from "../materials/find-material";
import { transitAt } from "../transfers/transfer-usage";
import { movementSources, NO_SOURCE, type MovementSource } from "./movement-sources";
import { CORRECTION_MOVEMENT, postStockMovements, toMovementView, type PostingSource, type StockMovementView } from "./stock-posting";
import { movementReversals } from "./movement-reversals";

export type { MovementSource, StockMovementView };
export type { SourceDocument } from "./movement-sources";
export type StockLine = z.infer<typeof stockCorrectionSchema>;
export type StockPair = z.infer<typeof stockPairSchema>;
export type StockLedgerQuery = z.input<typeof stockLedgerQuerySchema>;
/** A ledger movement with the document it came from (INV-012). */
export interface LedgerMovementView extends StockMovementView {
  source: MovementSource;
  reverses: string | null;
  reversedBy: string | null;
  canReverse: boolean;
}
export interface StockView extends StockPair {
  materialDescription: string; locationName: string; baseUnit: string;
  materialActive: boolean; locationActive: boolean; quantity: string;
  /** In transit on Open transfers from and to this location: the transfers', usable at neither site (UX-017, INV-009). */
  inTransitFrom: string; inTransitTo: string;
  /** The IDs of the Open transfers holding that transit, ascending. */
  transitTransfers: string[];
  /** One page of the pair's ledger, newest first, and how many movements it has in all. */
  page: number; movementCount: number;
  movements: LedgerMovementView[];
}

/** Physical stock for one tenant. All writes, snapshots and audit share one transaction (R03/R05/R08/R09). */
export class StockService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  /**
   * A missing pair means exact zero; inactive masters and their immutable history stay readable. The
   * ledger is paged, newest first, each movement with its source document (INV-012).
   */
  async get(input: StockLedgerQuery): Promise<StockView> {
    const em = this.em;
    const { page, ...key } = parseInput(stockLedgerQuerySchema, input);
    const material = await findMaterial(em, key.material);
    const location = await findLocation(em, key.location);
    const balance = await em.findOne(StockBalance, { material, location }, { refresh: true });
    const movementCount = await em.count(StockMovement, { material, location });
    const movements = await em.find(StockMovement, { material, location }, {
      orderBy: { occurredAt: "desc", id: "desc" }, limit: STOCK_LEDGER_PAGE_SIZE, offset: (page - 1) * STOCK_LEDGER_PAGE_SIZE,
    });
    const transit = await transitAt(em, material, location);
    return {
      ...key, materialDescription: material.description, locationName: location.name, baseUnit: material.baseUnit,
      materialActive: material.active, locationActive: location.active, quantity: balance?.quantity ?? "0.000000",
      inTransitFrom: transit.from, inTransitTo: transit.to, transitTransfers: transit.transfers,
      page, movementCount,
      movements: await ledgerViews(em, movements),
    };
  }

  /** Direct detail keeps original/inverse links reachable beyond the current ledger page. */
  async getMovement(id: string, pair?: StockPair): Promise<LedgerMovementView> {
    const movementId = parseInput(stockMovementIdSchema, id);
    const key = pair === undefined ? null : parseInput(stockPairSchema, pair);
    const movement = await this.em.findOne(StockMovement, { id: movementId, ...(key ? { material: { code: key.material }, location: { code: key.location } } : {}) }, { populate: ["material", "location"] });
    if (!movement) throw new NotFoundError("STOCK_MOVEMENT_NOT_FOUND", "This movement does not exist in this tenant or stock pair.");
    return (await ledgerViews(this.em, [movement]))[0];
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

  /** The generated dataset's opening balances: one correction group posted as the seed at `at`, unaudited and unguarded. */
  async seedDemo(lines: readonly { material: string; location: string; quantity: string; unit: string }[], at: Date): Promise<StockMovementView[]> {
    return this.em.transactional((em) => postStockMovements(em, { lines: [...lines], reason: "Demonstration opening balance" }, { type: CORRECTION_MOVEMENT, id: randomUUID() }, { kind: "seed", at }));
  }
}

async function ledgerViews(em: EntityManager, movements: StockMovement[]): Promise<LedgerMovementView[]> {
  const links = await movementReversals(em, movements.map(({ id }) => id));
  const originals = new Map(links.map(({ original, inverse }) => [inverse.id, original]));
  const inverses = new Map(links.map(({ original, inverse }) => [original.id, inverse.id]));
  const sources = await movementSources(em, [...movements, ...originals.values()]);
  return movements.map((movement) => {
    const original = originals.get(movement.id);
    const reversedBy = inverses.get(movement.id) ?? null;
    return { ...toMovementView(movement), source: sources.get((original ?? movement).postingId) ?? NO_SOURCE,
      reverses: original?.id ?? null, reversedBy,
      canReverse: reversedBy === null && [CORRECTION_MOVEMENT, "goods-receipt", "goods-issue"].includes(movement.type),
    };
  });
}
