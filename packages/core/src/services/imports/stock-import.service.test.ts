import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Location, Material, StockBalance, StockMovement, TenantAuditEvent, type TenantCode } from "@cpg/db";
import { scopeForTenant } from "../../container/tenant-scope";
import type { Cell, WorkbookSheet } from "../../domain/imports/cells";
import { prepareStockImport } from "../../domain/imports/prepare-stock-import";
import { AppError } from "../../http/errors";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { ACTOR, importKit, type ImportKit } from "./import-test-kit";
import { STOCK_IMPORT_STALE_MESSAGE } from "./stock-import.service";

/*
 * The stock import on a real SQLite file (spec 2026-10-20--2225UTC-stock-import): STX-002…021. Each
 * test gets a fresh database (the audit is append-only), with materials 00000001 Flint (each, 12 per
 * case), 00000002 Mammoth hide (kg) and locations 00000001 Main cave and 00000002 River cave.
 */

const USER: AuditActor = { userId: "user-id", username: "bob", sessionId: "bob-session", channel: "api", token: { id: "t1", name: "Robot" } };
const HEADERS = ["Material ID", "Location ID", "Physical quantity", "Unit"];
const stock = (...rows: Cell[][]): WorkbookSheet[] => [{ name: "Stock", rows: [HEADERS, ...rows] }];

let kit: ImportKit;

beforeEach(async () => {
  kit = await importKit();
  for (const tenant of ["prod", "test"] as const) {
    await kit.write(async ({ materialService, locationService }) => {
      await materialService.create({ type: "raw", description: "Flint", baseUnit: "each" }, ACTOR);
      await materialService.create({ type: "raw", description: "Mammoth hide", baseUnit: "kg" }, ACTOR);
      await materialService.addConversion("00000001", { unit: "case", numerator: "12", denominator: "1" }, ACTOR);
      await locationService.create({ name: "Main cave" }, ACTOR);
      await locationService.create({ name: "River cave" }, ACTOR);
    }, tenant);
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  await kit.orm.close();
});

const dryRun = (workbook: WorkbookSheet[], tenant: TenantCode = "prod") =>
  kit.write(({ stockImportService }) => stockImportService.dryRun(prepareStockImport(workbook)), tenant);
const commit = (workbook: WorkbookSheet[], token: string, reason = "Stock count 2027-01", actor = ACTOR, tenant: TenantCode = "prod") =>
  kit.write(({ stockImportService }) => stockImportService.commit(prepareStockImport(workbook), token, reason, actor), tenant);
/** A dry run, then the commit of its token. */
async function apply(workbook: WorkbookSheet[], reason?: string, actor?: AuditActor, tenant: TenantCode = "prod") {
  const preview = await dryRun(workbook, tenant);
  expect(preview.errors).toEqual([]);
  return commit(workbook, preview.previewToken!, reason, actor, tenant);
}
const correct = (material: string, location: string, quantity: string, tenant: TenantCode = "prod") =>
  kit.write(({ stockService }) => stockService.correct({ material, location, quantity, unit: material === "00000002" ? "kg" : "each", reason: "Manual" }, ACTOR), tenant);
const balance = async (material: string, location: string, tenant: TenantCode = "prod") =>
  (await kit.write(({ stockService }) => stockService.get({ material, location }), tenant)).quantity;
/** How many movements, audit entries and balance rows Prod holds. */
async function counts() {
  const em = (await scopeForTenant(kit.container, "prod")).cradle.em;
  return { movements: await em.count(StockMovement, {}), audit: await em.count(TenantAuditEvent, {}), balances: await em.count(StockBalance, {}) };
}

describe("the stock import's dry run", () => {
  it("computes each position's movement from the desired balance, and writes nothing (STX-003, STX-004, STX-005)", async () => {
    await correct("00000001", "00000001", "100");
    await correct("00000002", "00000001", "100");
    await correct("00000001", "00000002", "100");
    const before = await counts();

    const report = await dryRun(stock([1, 1, 85, null], [2, 1, 130, "kg"], [1, 2, 100, null], [2, 2, 5, null]));

    expect(report).toMatchObject({ committed: false, errors: [], summary: [{ sheet: "Stock", created: 0, updated: 3, unchanged: 1, errors: 0 }] });
    expect(report.previewToken).toMatch(/^[0-9a-f]{64}$/);
    expect(report.rows).toEqual([
      {
        sheet: "Stock",
        row: 2,
        action: "update",
        record: "00000001/00000001",
        label: "00000001 — Flint at 00000001 — Main cave",
        changes: [
          { field: "Physical quantity", before: "100.000000 each", after: "85.000000 each" },
          { field: "Movement", before: null, after: "-15.000000 each" },
        ],
      },
      expect.objectContaining({ row: 3, action: "update", changes: [expect.anything(), { field: "Movement", before: null, after: "+30.000000 kg" }] }),
      { sheet: "Stock", row: 4, action: "unchanged", record: "00000001/00000002", label: "00000001 — Flint at 00000002 — River cave", changes: [] },
      expect.objectContaining({ row: 5, action: "update", record: "00000002/00000002", changes: [{ field: "Physical quantity", before: "0.000000 kg", after: "5.000000 kg" }, expect.anything()] }),
    ]);
    // Not even a balance row for the new pair 00000002/00000002 (spec Q7).
    expect(await counts()).toEqual(before);
    expect(await balance("00000001", "00000001")).toBe("100.000000");
  });

  it("reads a quantity in another unit as the desired base-unit balance, not as a change (STX-015)", async () => {
    await correct("00000001", "00000001", "10");
    const report = await dryRun(stock([1, 1, 2, "case"]));
    expect(report.rows[0].changes).toEqual([
      { field: "Entered", before: null, after: "2 case" },
      { field: "Physical quantity", before: "10.000000 each", after: "24.000000 each" },
      { field: "Movement", before: null, after: "+14.000000 each" },
    ]);
  });

  it("reports every problem at once, on its row and column, and gives no token (STX-010…013, STX-017)", async () => {
    await kit.write(async ({ em }) => {
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      (await em.findOneOrFail(Location, { code: "00000002" })).active = false;
      await em.flush();
    });

    const report = await dryRun(
      stock(
        [1, 1, 5, null],
        [42, 1, 5, null],
        [1, 99, 5, null],
        [2, 1, 5, null],
        [1, 2, 5, null],
        [1, 1, -1, null],
        [3, 3, 1, null],
        [1, 1, 5, "box"],
        [1, 1, 5, null],
        [1, 1, "999999999999", "case"],
        [1, 1, "0.000001", "case"],
      ),
    );

    expect(report.previewToken).toBeNull();
    expect(report.errors.map((error) => [error.row, error.column, error.code])).toEqual([
      [2, "Location ID", "IMPORT_DUPLICATE_KEY"],
      [3, "Material ID", "IMPORT_MISSING_REFERENCE"],
      [4, "Location ID", "IMPORT_MISSING_REFERENCE"],
      [5, "Material ID", "MATERIAL_INACTIVE"],
      [6, "Location ID", "LOCATION_INACTIVE"],
      [7, "Physical quantity", "VALIDATION_FAILED"],
      [8, "Material ID", "IMPORT_MISSING_REFERENCE"],
      [9, "Location ID", "IMPORT_DUPLICATE_KEY"],
      [10, "Location ID", "IMPORT_DUPLICATE_KEY"],
      [11, "Location ID", "IMPORT_DUPLICATE_KEY"],
      [12, "Location ID", "IMPORT_DUPLICATE_KEY"],
    ]);
    expect(report.errors[1]).toEqual({
      sheet: "Stock",
      row: 3,
      column: "Material ID",
      code: "IMPORT_MISSING_REFERENCE",
      message: "Material 00000042 doesn't exist in Prod. Check the ID, or create the material first.",
      params: { id: "00000042", record: "material" },
    });
    expect(report.errors[2].message).toBe("Location 00000099 doesn't exist in Prod. Check the ID, or create the location first.");
    expect(report.summary).toEqual([{ sheet: "Stock", created: 0, updated: 0, unchanged: 0, errors: 11 }]);
  });

  it("refuses a unit without a conversion, even for 0, and a quantity out of range for the base unit", async () => {
    const report = await dryRun(stock([1, 1, 0, "box"], [2, 1, "0.0000001", null], [1, 2, "999999999999", "case"], [2, 2, "0.000001", "g"]));
    expect(report.errors.map((error) => [error.row, error.column, error.code])).toEqual([
      [2, "Unit", "UNIT_NOT_CONVERTIBLE"],
      [3, "Physical quantity", "VALIDATION_FAILED"],
      [4, "Physical quantity", "QUANTITY_OUT_OF_RANGE"],
      [5, "Unit", "UNIT_NOT_CONVERTIBLE"],
    ]);
    await kit.write(({ materialService }) => materialService.addConversion("00000002", { unit: "g", numerator: "1", denominator: "1000000000" }, ACTOR));
    expect((await dryRun(stock([2, 2, "0.000001", "g"]))).errors.map((error) => [error.column, error.code])).toEqual([["Physical quantity", "QUANTITY_ROUNDS_TO_ZERO"]]);
  });

  it("passes on a refusal it doesn't place, with no column, and lets a real failure through", async () => {
    const prototype = Object.getPrototypeOf((await scopeForTenant(kit.container, "prod")).cradle.em) as { findOne: (...args: unknown[]) => unknown };
    const original = prototype.findOne;
    let failure: Error = new AppError("SOMETHING_ELSE", "Something else.", 409, { why: "test" });
    vi.spyOn(prototype, "findOne").mockImplementation(function (this: unknown, ...args: unknown[]) {
      if (args[0] === StockBalance) throw failure;
      return original.apply(this, args);
    });
    const report = await dryRun(stock([1, 1, 5, null]));
    expect(report.errors).toEqual([{ sheet: "Stock", row: 2, column: null, code: "SOMETHING_ELSE", message: "Something else.", params: { why: "test" } }]);
    failure = new Error("disk on fire");
    await expect(dryRun(stock([1, 1, 5, null]))).rejects.toThrow("disk on fire");
  });

  it("names no sheet line for a workbook without a Stock sheet", async () => {
    const report = await dryRun([{ name: "Materials", rows: [["ID"]] }]);
    expect(report).toMatchObject({ previewToken: null, summary: [], rows: [] });
    expect(report.errors.map((error) => error.code)).toEqual(["IMPORT_UNKNOWN_SHEET"]);
  });
});

describe("the stock import's commit", () => {
  it("posts an opening balance as an ordinary correction with its reason, audit and actor (STX-002, INV-016, STX-018)", async () => {
    const report = await apply(stock([1, 1, 100, null]), "Opening balance", USER);

    expect(report).toMatchObject({ committed: true, previewToken: null, errors: [], summary: [{ sheet: "Stock", updated: 1, unchanged: 0 }] });
    const view = await kit.write(({ stockService }) => stockService.get({ material: "00000001", location: "00000001" }));
    expect(view.quantity).toBe("100.000000");
    expect(view.movements).toEqual([
      expect.objectContaining({ type: "correction", quantity: "100.000000", balanceBefore: "0.000000", balanceAfter: "100.000000", reason: "Opening balance", actorUsername: "bob", actorUserId: "user-id", channel: "api" }),
    ]);
    const [entry] = await (await scopeForTenant(kit.container, "prod")).cradle.em.find(TenantAuditEvent, { action: "stock.movement.posted" });
    expect(entry).toMatchObject({ actorUsername: "bob", sessionId: "bob-session", channel: "api", before: { quantity: "0.000000" }, after: expect.objectContaining({ quantity: "100.000000", movement: "100.000000", reason: "Opening balance", type: "correction" }) });
  });

  it("moves listed positions to their desired balance, leaves the others alone, and posts one group (STX-003…009, STX-021)", async () => {
    await correct("00000001", "00000001", "90");
    await correct("00000001", "00000002", "100");
    await correct("00000002", "00000001", "100");
    await correct("00000002", "00000002", "20");
    const movements = (await counts()).movements;

    await apply(stock([1, 1, 105, null], [2, 1, 0, null], [1, 2, 100, null]));

    expect(await balance("00000001", "00000001")).toBe("105.000000");
    expect(await balance("00000002", "00000001")).toBe("0.000000");
    expect(await balance("00000001", "00000002")).toBe("100.000000");
    expect(await balance("00000002", "00000002")).toBe("20.000000");
    const posted = await (await scopeForTenant(kit.container, "prod")).cradle.em.find(StockMovement, { reason: "Stock count 2027-01" }, { orderBy: { position: "asc" }, populate: ["material", "location"] });
    expect(posted.map((movement) => [movement.material.code, movement.location.code, movement.position, movement.quantity, movement.balanceBefore, movement.balanceAfter, movement.enteredUnit])).toEqual([
      ["00000001", "00000001", 0, "15.000000", "90.000000", "105.000000", "each"],
      ["00000002", "00000001", 1, "-100.000000", "100.000000", "0.000000", "kg"],
    ]);
    expect(new Set(posted.map((movement) => movement.postingId)).size).toBe(1);
    expect((await counts()).movements).toBe(movements + 2);
  });

  it("leaves every position at a stocked site the workbook doesn't list exactly as it was, with no movement (STX-006)", async () => {
    // Three stocked sites; the workbook lists two of them.
    await kit.write(({ locationService }) => locationService.create({ name: "Lake cave" }, ACTOR));
    const sites = ["00000001", "00000002", "00000003"];
    for (const location of sites) {
      await correct("00000001", location, "50");
      await correct("00000002", location, "30");
    }
    const em = () => scopeForTenant(kit.container, "prod").then(({ cradle }) => cradle.em);
    const movementsAt = async (location: string) => (await em()).count(StockMovement, { location: { code: location } });
    const untouched = await movementsAt("00000003");

    await apply(stock([1, 1, 45, null], [2, 1, 35, null], [1, 2, 40, null], [2, 2, 30, null]));

    expect([await balance("00000001", "00000001"), await balance("00000002", "00000001")]).toEqual(["45.000000", "35.000000"]);
    expect([await balance("00000001", "00000002"), await balance("00000002", "00000002")]).toEqual(["40.000000", "30.000000"]);
    expect([await balance("00000001", "00000003"), await balance("00000002", "00000003")]).toEqual(["50.000000", "30.000000"]);
    expect(await movementsAt("00000003")).toBe(untouched);
    const posted = await (await em()).find(StockMovement, { reason: "Stock count 2027-01" }, { populate: ["location"], orderBy: { position: "asc" } });
    expect(posted.map((movement) => movement.location.code)).toEqual(["00000001", "00000001", "00000002"]);
  });

  it("reverses one line of an imported correction alone, and only once (#91 spec Q6)", async () => {
    await apply(stock([1, 1, 100, null], [2, 1, 50, null], [1, 2, 30, null]));
    const em = async () => (await scopeForTenant(kit.container, "prod")).cradle.em;
    const posted = await (await em()).find(StockMovement, { reason: "Stock count 2027-01" }, { orderBy: { position: "asc" } });
    expect(posted).toHaveLength(3);
    expect(new Set(posted.map((movement) => movement.postingId)).size).toBe(1);
    const reverse = (id: string) => kit.write(({ stockReversalService }) => stockReversalService.reverse(id, { reason: "Hide miscounted" }, ACTOR));

    const reversal = await reverse(posted[1].id);

    expect(reversal).toMatchObject({ original: posted[1].id, movement: expect.objectContaining({ type: "reversal", quantity: "-50.000000" }) });
    expect(await balance("00000002", "00000001")).toBe("0.000000");
    // The posting's other lines stay exactly as imported.
    expect([await balance("00000001", "00000001"), await balance("00000001", "00000002")]).toEqual(["100.000000", "30.000000"]);
    expect(await (await em()).count(StockMovement, { type: "reversal" })).toBe(1);
    await expect(reverse(posted[1].id)).rejects.toMatchObject({ code: "STOCK_ALREADY_REVERSED" });
    expect(await balance("00000002", "00000001")).toBe("0.000000");
    expect(await (await em()).count(StockMovement, { type: "reversal" })).toBe(1);
  });

  it("posts more than one flush's lines as one posting, numbered in row order", async () => {
    await kit.write(async ({ em }) => {
      for (let code = 3; code <= 51; code++) em.create(Location, { code: String(code).padStart(8, "0"), name: `Cave ${code}` });
      await em.flush();
    });
    const rows: Cell[][] = [];
    for (let location = 1; location <= 51; location++) rows.push([1, location, location, null], [2, location, location, null]);

    await apply(stock(...rows));

    const posted = await (await scopeForTenant(kit.container, "prod")).cradle.em.find(StockMovement, {}, { orderBy: { position: "asc" }, populate: ["material", "location"] });
    expect(posted).toHaveLength(102);
    expect(posted.map((movement) => movement.position)).toEqual([...Array(102).keys()]);
    expect(new Set(posted.map((movement) => movement.postingId)).size).toBe(1);
    expect([posted[100].material.code, posted[100].location.code, posted[100].quantity]).toEqual(["00000001", "00000051", "51.000000"]);
    expect(await balance("00000002", "00000051")).toBe("51.000000");
  });

  it("posts the difference to the converted desired balance (STX-015)", async () => {
    await correct("00000001", "00000001", "10");
    await apply(stock([1, 1, 2, "case"]));
    expect(await balance("00000001", "00000001")).toBe("24.000000");
  });

  it("posts nothing when every position already has its balance", async () => {
    await correct("00000001", "00000001", "100");
    const movements = (await counts()).movements;
    const report = await apply(stock([1, 1, 100, null]));
    expect(report).toMatchObject({ committed: true, rows: [expect.objectContaining({ action: "unchanged" })] });
    expect((await counts()).movements).toBe(movements);
  });

  it("refuses as stale when a listed balance changed since the dry run, keeping that change (STX-016)", async () => {
    await correct("00000001", "00000001", "100");
    const workbook = stock([1, 1, 85, null]);
    const { previewToken } = await dryRun(workbook);
    await correct("00000001", "00000001", "-10");

    await expect(commit(workbook, previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE", message: STOCK_IMPORT_STALE_MESSAGE });
    expect(await balance("00000001", "00000001")).toBe("90.000000");
  });

  it("is stale even when the balance changed and came back, but not when a name changed", async () => {
    await correct("00000001", "00000001", "100");
    const workbook = stock([1, 1, 85, null]);
    const { previewToken } = await dryRun(workbook);
    await correct("00000001", "00000001", "-10");
    await correct("00000001", "00000001", "10");
    await expect(commit(workbook, previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE" });

    const again = await dryRun(workbook);
    await kit.write(async ({ em }) => {
      (await em.findOneOrFail(Material, { code: "00000001" })).description = "Flint stone";
      await em.flush();
    });
    const report = await commit(workbook, again.previewToken!);
    expect(report.rows[0].label).toBe("00000001 — Flint stone at 00000001 — Main cave");
    expect(await balance("00000001", "00000001")).toBe("85.000000");
  });

  it("is stale for a new pair that gained a balance, and for another generation", async () => {
    const workbook = stock([1, 1, 5, null]);
    const { previewToken } = await dryRun(workbook);
    await correct("00000001", "00000001", "5");
    await expect(commit(workbook, previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE" });

    const test = await dryRun(workbook, "test");
    expect(test.previewToken).not.toBe((await dryRun(workbook)).previewToken);
  });

  it("refuses a forged token or a workbook with errors, and writes nothing (STX-017, AUD-022)", async () => {
    const movements = (await counts()).movements;
    const audit = (await counts()).audit;
    await expect(commit(stock([1, 1, 5, null]), "f".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE" });
    await expect(commit(stock([1, 1, 5, null], [1, 2, -1, null], [42, 1, 1, null]), "f".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE" });
    expect((await counts()).movements).toBe(movements);
    expect((await counts()).audit).toBe(audit);
  });

  it("changes only the tenant it runs in", async () => {
    await apply(stock([1, 1, 7, null]), "Opening balance", ACTOR, "test");
    expect(await balance("00000001", "00000001", "test")).toBe("7.000000");
    expect(await balance("00000001", "00000001", "prod")).toBe("0.000000");
  });

  it("leaves in-transit stock on its transfer: only the physical balance moves (STX-020)", async () => {
    await correct("00000001", "00000001", "50");
    const transfer = await kit.write(async ({ transferService }) => {
      const created = await transferService.create(
        { material: "00000001", source: "00000001", destination: "00000002", quantity: "10", unit: "each", plannedDispatch: "2027-01-01", plannedArrival: "2027-01-02" },
        ACTOR,
      );
      await transferService.dispatch(created.id, { quantity: "10", unit: "each" }, ACTOR);
      return created.id;
    });
    await apply(stock([1, 2, 60, null]));
    expect(await balance("00000001", "00000002")).toBe("60.000000");
    expect((await kit.write(({ transferService }) => transferService.get(transfer))).inTransit).toBe("10.000000");
  });

  it("rolls every chunk back when a later chunk fails: one posting, all or nothing", async () => {
    await kit.write(async ({ em }) => {
      for (let code = 3; code <= 20; code++) em.create(Location, { code: String(code).padStart(8, "0"), name: `Cave ${code}` });
      await em.flush();
    });
    const rows: Cell[][] = [];
    for (let location = 1; location <= 20; location++) rows.push([1, location, location, null], [2, location, location, null]);
    const workbook = stock(...rows);
    const { previewToken } = await dryRun(workbook);
    const before = await counts();
    const scope = await scopeForTenant(kit.container, "prod");
    const flush = scope.cradle.em.flush.bind(scope.cradle.em);
    let flushes = 0;
    vi.spyOn(scope.cradle.em, "flush").mockImplementation(async () => {
      flushes += 1;
      if (flushes === 2) throw new Error("the second chunk failed");
      return flush();
    });

    await expect(
      inRequestTransaction(scope.cradle.em, () => scope.cradle.stockImportService.commit(prepareStockImport(workbook), previewToken!, "Count", ACTOR)),
    ).rejects.toThrow("the second chunk failed");

    expect(flushes).toBe(2);
    expect(await counts()).toEqual(before);
  });

  it("joins the caller's transaction: a later failure rolls the posting back", async () => {
    const workbook = stock([1, 1, 5, null]);
    const { previewToken } = await dryRun(workbook);
    const scope = await scopeForTenant(kit.container, "prod");
    await expect(
      inRequestTransaction(scope.cradle.em, async () => {
        await scope.cradle.stockImportService.commit(prepareStockImport(workbook), previewToken!, "Count", ACTOR);
        throw new Error("the key store failed");
      }),
    ).rejects.toThrow("the key store failed");
    expect(await balance("00000001", "00000001")).toBe("0.000000");
  });
});
