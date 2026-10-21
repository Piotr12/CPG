import { randomUUID } from "node:crypto";
import { StockBalance, type EntityManager, type Location, type Material } from "@cpg/db";
import type { PreparedStockImport } from "../../domain/imports/prepare-stock-import";
import type { ImportIssue, SheetRow } from "../../domain/imports/read-sheets";
import { previewToken } from "../../domain/imports/preview-token";
import { STOCK_SHEET } from "../../domain/imports/stock-layout";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { formatSignedQuantity } from "../../domain/stock/signed-quantity";
import { AppError, ConflictError } from "../../http/errors";
import type { StockRow } from "../../validators/imports/import-rows.schema";
import type { AuditActor } from "../audit/actor";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { CORRECTION_MOVEMENT, postStockMovements } from "../stock/stock-posting";
import type { TenantInfo, TenantService } from "../tenants/tenant.service";
import type { ImportChange, ImportRowOutcome } from "./apply-context";
import type { ImportReport } from "./apply-import";

interface Deps {
  em: EntityManager;
  tenant: TenantInfo;
  tenantService: TenantService;
}

/** One movement a commit posts: a position's signed difference, in its material's base unit. */
interface StockLine {
  material: string;
  location: string;
  quantity: string;
  unit: string;
}

/** What the read pass makes of the rows: the report without its `committed` flag, and the lines to post. */
interface ReadPass {
  report: Omit<ImportReport, "committed">;
  lines: StockLine[];
}

const SHEET = STOCK_SHEET.name;

/** What a commit says when its re-run doesn't match the dry run it names (spec Q6). */
export const STOCK_IMPORT_STALE_MESSAGE = "A balance this workbook lists changed since the dry run, or the workbook differs. Run the dry run again.";

/**
 * How many lines one flush of a commit posts. Measured on 2,000 new positions: one flush of all of
 * them took 23.5 s, chunks of 100 took 2.0 s, of 50 1.4 s, of 25 1.2 s (spec Q11).
 */
const POSTING_CHUNK = 25;

/** Where a refusal of the read pass is shown, by its code. */
const COLUMNS: Record<string, string> = {
  MATERIAL_INACTIVE: "Material ID",
  LOCATION_INACTIVE: "Location ID",
  UNIT_NOT_CONVERTIBLE: "Unit",
  QUANTITY_OUT_OF_RANGE: "Physical quantity",
  QUANTITY_ROUNDS_TO_ZERO: "Physical quantity",
};

/**
 * The stock import (E07-S02, spec `2026-10-20--2225UTC-stock-import`). Resolved from a tenant scope
 * and called inside that request's write transaction, with a workbook `prepareStockImport` already
 * read. Both methods run the same read pass: each row's desired physical quantity, converted to the
 * base unit, against the position's current balance (Q2, Q3). The dry run writes nothing (Q7). The
 * commit posts every difference as one `correction` with one reason (Q4, Q5), only when its re-run
 * computes the dry run's token (Q6). Both roles may call it (Q9); the gates are the caller's. Both
 * methods clear the request `em`'s identity map as they go, so the caller must have flushed first.
 */
export class StockImportService {
  private readonly em: EntityManager;
  private readonly tenant: TenantInfo;
  private readonly tenantService: TenantService;

  constructor({ em, tenant, tenantService }: Deps) {
    this.em = em;
    this.tenant = tenant;
    this.tenantService = tenantService;
  }

  /** Every error, or each position's movement and the token a commit needs (STX-003…017). Writes nothing. */
  async dryRun(prepared: PreparedStockImport): Promise<ImportReport> {
    return { committed: false, ...(await this.read(prepared)).report };
  }

  /**
   * Posts the dry run's movements in one go, or nothing (STX-016, STX-017): the re-run must find no
   * error and compute the token the dry run returned, or it is `IMPORT_STALE`. Every movement gets
   * `reason` (already parsed by the commit schema) and is audited for `actor` (STX-018, STX-021).
   */
  async commit(prepared: PreparedStockImport, token: string, reason: string, actor: AuditActor): Promise<ImportReport> {
    const { report, lines } = await this.read(prepared);
    if (report.previewToken !== token) throw new ConflictError(STOCK_IMPORT_STALE_MESSAGE, "IMPORT_STALE");
    const source = { type: CORRECTION_MOVEMENT, id: randomUUID() };
    // One posting, flushed in chunks: an identity map grown by 2,000 lines made every query's
    // auto-flush walk it, and a 2,000-line commit took 23.5 s (spec Q11).
    for (let start = 0; start < lines.length; start += POSTING_CHUNK) {
      const chunk = lines.slice(start, start + POSTING_CHUNK);
      await postStockMovements(this.em, { lines: chunk, reason }, source, { kind: "user", actor }, { firstPosition: start });
      this.em.clear();
    }
    return { ...report, committed: true, previewToken: null };
  }

  private async read(prepared: PreparedStockImport): Promise<ReadPass> {
    const errors: ImportIssue[] = [...prepared.errors];
    const rows: ImportRowOutcome[] = [];
    const versions: string[] = [];
    const lines: StockLine[] = [];
    for (const row of prepared.rows) {
      try {
        const read = await this.readRow(row);
        rows.push(read.outcome);
        versions.push(read.version);
        if (read.line) lines.push(read.line);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        errors.push(this.issueOf(error, row.row));
      } finally {
        // Nothing is written here, so every row can start from an empty identity map: a commit's
        // flushes then walk only their own movements, not 2,000 rows of masters (lesson).
        this.em.clear();
      }
    }
    // Only `IMPORT_EMPTY` has no row, and it is always the only error, so it is never compared.
    errors.sort((a, b) => a.row! - b.row!);
    const { generation } = await this.tenantService.currentState(this.tenant.code);
    // The label (names) is left out: renaming a master between the two calls changes no movement.
    const outcomes = rows.map(({ sheet, row, action, record, changes }) => ({ sheet, row, action, record, changes }));
    const token = errors.length > 0 ? null : previewToken({ kind: "stock", generation, cells: prepared.cells, rows: outcomes, versions });
    const updated = rows.filter((row) => row.action === "update").length;
    const summary = prepared.hasStockSheet || errors.some((error) => error.sheet === SHEET)
      ? [{ sheet: SHEET, created: 0, updated, unchanged: rows.length - updated, errors: errors.filter((error) => error.sheet === SHEET).length }]
      : [];
    return { report: { previewToken: token, summary, rows, errors }, lines };
  }

  /** One position: its masters, the desired quantity in the base unit, the current balance and the difference. */
  private async readRow({ row, values }: SheetRow<StockRow>): Promise<{ outcome: ImportRowOutcome; version: string; line: StockLine | null }> {
    const material = await this.referenced(() => findActiveMaterial(this.em, values.material), "MATERIAL_NOT_FOUND", "material", values.material, "Material ID");
    const location = await this.referenced(() => findActiveLocation(this.em, values.location), "LOCATION_NOT_FOUND", "location", values.location, "Location ID");
    const unit = values.unit ?? material.baseUnit;
    const desired = parseDecimal((await convertToBaseQuantity(this.em, material, { quantity: values.quantity, unit })).baseQuantity)!;
    const balance = await this.em.findOne(StockBalance, { material, location }, { refresh: true });
    const current = parseDecimal(balance?.quantity ?? "0")!;
    const delta = desired - current;
    const record = `${values.material}/${values.location}`;
    const outcome: ImportRowOutcome = {
      sheet: SHEET,
      row,
      action: delta === 0n ? "unchanged" : "update",
      record,
      label: positionLabel(material, location),
      changes: delta === 0n ? [] : changes(material.baseUnit, current, desired, delta, unit === material.baseUnit ? null : `${formatDecimal(parseDecimal(values.quantity)!)} ${unit}`),
    };
    const version = `StockBalance:${record}@${balance?.version ?? "none"}`;
    const line = delta === 0n ? null : { material: values.material, location: values.location, quantity: formatSignedQuantity(delta), unit: material.baseUnit };
    return { outcome, version, line };
  }

  /** A master the row names, its not-found turned into the import's own error on its column (STX-011, STX-012). */
  private async referenced<T>(load: () => Promise<T>, notFoundCode: string, noun: string, id: string, column: string): Promise<T> {
    try {
      return await load();
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== notFoundCode) throw error;
      const message = `${noun === "material" ? "Material" : "Location"} ${id} doesn't exist in ${this.tenant.name}. Check the ID, or create the ${noun} first.`;
      throw new StockRowError("IMPORT_MISSING_REFERENCE", message, column, { id, record: noun });
    }
  }

  /** A row's refusal, on the column it concerns. */
  private issueOf(error: AppError, row: number): ImportIssue {
    if (error instanceof StockRowError) return { sheet: SHEET, row, column: error.column, code: error.code, message: error.message, params: error.params };
    return { sheet: SHEET, row, column: COLUMNS[error.code] ?? null, code: error.code, message: error.message, ...(error.messageParams && { params: error.messageParams }) };
  }
}

/** A row's own refusal, with the column it belongs on. */
class StockRowError extends AppError {
  constructor(
    code: string,
    message: string,
    readonly column: string,
    readonly params: Record<string, string>,
  ) {
    super(code, message);
  }
}

/** "00000001 — Flint at 00000002 — Main cave". */
function positionLabel(material: Material, location: Location): string {
  return `${material.code} — ${material.description} at ${location.code} — ${location.name}`;
}

/** What a corrected position shows: its quantity before and after, the movement, and what was typed in another unit. */
function changes(unit: string, current: bigint, desired: bigint, delta: bigint, entered: string | null): ImportChange[] {
  const quantity = (value: bigint) => `${formatDecimal(value, { fixed: true })} ${unit}`;
  return [
    ...(entered ? [{ field: "Entered", before: null, after: entered }] : []),
    { field: "Physical quantity", before: quantity(current), after: quantity(desired) },
    { field: "Movement", before: null, after: `${delta > 0n ? "+" : ""}${formatSignedQuantity(delta)} ${unit}` },
  ];
}
