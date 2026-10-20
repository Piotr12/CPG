import { Location, Material, StockBalance, Transfer, type EntityManager } from "@cpg/db";
import { PairTally, reportPage } from "../../domain/reports/stock-report-rows";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { inTransitOf } from "../../domain/transfers/transfer-quantity";
import { parseInput } from "../../http/parse-input";
import { STOCK_REPORT_PAGE_SIZE, stockReportQuerySchema } from "../../validators/reports/stock-report.schema";
import { findLocation } from "../locations/find-location";
import { findMaterial } from "../materials/find-material";

/** How many balances, and how many Open transfers, one read holds, so the identity map stays bounded. */
const BALANCE_BATCH = 500;
const TRANSFER_BATCH = 100;

/** Business IDs by UUID, for the masters a read may meet. */
type Codes = { material: Map<string, string>; location: Map<string, string> };
const codeById = (records: { id: string; code: string }[]) => new Map(records.map(({ id, code }) => [id, code]));

/** One row: a material at a location, with the figures in its base unit as six-decimal strings (spec Q2). */
export interface StockReportRow {
  material: string; materialDescription: string; materialActive: boolean; baseUnit: string;
  location: string; locationName: string; locationActive: boolean;
  /** Physical on-hand now. */
  quantity: string;
  /** In transit on Open transfers from and to the location: the transfers', never added to `quantity` (UX-017, INV-009). */
  inTransitFrom: string; inTransitTo: string;
}

/** One page of the report, and the server's UTC date it is as of. */
export interface StockReportView {
  asOf: string; page: number; pageSize: number; total: number; rows: StockReportRow[];
}

/**
 * The current stock report (E13-S01): physical on-hand and in transit per material and location,
 * read at request time and written nowhere. A pair is a row once anything was posted there or an
 * Open transfer has stock in transit from or to it (spec Q1).
 */
export class StockReportService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  /**
   * `raw` is the query as sent, text values (`stockReportQuerySchema`). A filter naming a material or
   * location this tenant doesn't have is `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` (R05).
   */
  async read(raw: Record<string, unknown>): Promise<StockReportView> {
    const em = this.em;
    const query = parseInput(stockReportQuerySchema, raw);
    const material = query.material === undefined ? undefined : await findMaterial(em, query.material);
    const location = query.location === undefined ? undefined : await findLocation(em, query.location);
    const materials = await em.find(Material, material ? { id: material.id } : {});
    const locations = await em.find(Location, location ? { id: location.id } : {});
    // Pairs are tallied by business ID, which orders the rows; balances and transfers reference masters by their UUID.
    const tally = new PairTally();
    const codes = { material: codeById(materials), location: codeById(locations) };
    await this.tallyBalances(tally, codes, material, location);
    await this.tallyTransit(tally, codes, material, location);
    const { total, rows } = reportPage(tally.values(), { includeZero: query.includeZero, page: query.page, pageSize: STOCK_REPORT_PAGE_SIZE });
    const text = (micro: bigint) => formatDecimal(micro, { fixed: true });
    const materialsByCode = new Map(materials.map((m) => [m.code, m]));
    const locationsByCode = new Map(locations.map((l) => [l.code, l]));
    return {
      asOf: new Date().toISOString().slice(0, 10), page: query.page, pageSize: STOCK_REPORT_PAGE_SIZE, total,
      rows: rows.map((pair) => {
        const { description, active, baseUnit } = materialsByCode.get(pair.material)!;
        const { name, active: locationActive } = locationsByCode.get(pair.location)!;
        return {
          material: pair.material, materialDescription: description, materialActive: active, baseUnit,
          location: pair.location, locationName: name, locationActive,
          quantity: text(pair.quantity), inTransitFrom: text(pair.inTransitFrom), inTransitTo: text(pair.inTransitTo),
        };
      }),
    };
  }

  /** Every balance record of the filtered pairs, zero ones included: the pair has history. */
  private async tallyBalances(tally: PairTally, codes: Codes, material?: Material, location?: Location): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const batch = await this.em.find(
        StockBalance,
        { ...(material && { material }), ...(location && { location }), ...(after !== undefined && { id: { $gt: after } }) },
        { orderBy: { id: "asc" }, limit: BALANCE_BATCH, disableIdentityMap: true },
      );
      for (const balance of batch) tally.add(codes.material.get(balance.material.id)!, codes.location.get(balance.location.id)!, "quantity", parseDecimal(balance.quantity)!);
      if (batch.length < BALANCE_BATCH) return;
      after = batch.at(-1)!.id;
    }
  }

  /** What Open transfers have in transit, counted out at their source and in at their destination, for the filtered pairs. */
  private async tallyTransit(tally: PairTally, codes: Codes, material?: Material, location?: Location): Promise<void> {
    const at = (place: Location) => location === undefined || place.id === location.id;
    const where = location ? { $or: [{ source: location }, { destination: location }] } : {};
    let after: string | undefined;
    for (;;) {
      const batch = await this.em.find(
        Transfer,
        { status: "open", ...(material && { material }), ...where, ...(after !== undefined && { code: { $gt: after } }) },
        { orderBy: { code: "asc" }, limit: TRANSFER_BATCH, disableIdentityMap: true },
      );
      for (const transfer of batch) {
        const transit = parseDecimal(inTransitOf(transfer))!;
        if (transit === 0n) continue;
        const code = codes.material.get(transfer.material.id)!;
        if (at(transfer.source)) tally.add(code, codes.location.get(transfer.source.id)!, "inTransitFrom", transit);
        if (at(transfer.destination)) tally.add(code, codes.location.get(transfer.destination.id)!, "inTransitTo", transit);
      }
      if (batch.length < TRANSFER_BATCH) return;
      after = batch.at(-1)!.code;
    }
  }
}
