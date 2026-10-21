import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, selectTenant, Location, Material, StockBalance, Transfer, type Orm, type TenantCode } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { STOCK_REPORT_PAGE_SIZE } from "../../validators/reports/stock-report.schema";
import type { AuditActor } from "../audit/actor";
import { StockService } from "../stock/stock.service";
import { TransferService } from "../transfers/transfer.service";
import { StockReportService } from "./stock-report.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const STEEL = "00000001";
const BOLT = "00000002";
const A = "00000001";
const B = "00000002";
const C = "00000003";
const today = () => new Date().toISOString().slice(0, 10);

describe("StockReportService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const report = (query = {}, tenant: TenantCode = "prod") => new StockReportService({ em: scoped(tenant) }).read(query);
  const correct = (material: string, location: string, quantity: string, tenant: TenantCode = "prod") =>
    new StockService({ em: scoped(tenant) }).correct({ material, location, quantity, unit: material === STEEL ? "kg" : "each", reason: "Count" }, ACTOR);
  const transfers = () => new TransferService({ em: scoped() });
  /** A transfer of `quantity` kg of steel from A to B, `dispatched` of it dispatched. */
  const onTheRoad = async (dispatched: string, quantity = "100") => {
    const transfer = await transfers().create({ material: STEEL, source: A, destination: B, quantity, unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22" }, ACTOR);
    await transfers().dispatch(transfer.id, { quantity: dispatched, unit: "kg" }, ACTOR);
    return transfer;
  };
  /** The figures of each row, in order: material/location, on hand, out, in. */
  const figures = async (query = {}, tenant: TenantCode = "prod") =>
    (await report(query, tenant)).rows.map((row) => [`${row.material}/${row.location}`, row.quantity, row.inTransitFrom, row.inTransitTo]);

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-stock-report-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      em.create(Material, { code: STEEL, type: "raw", description: "Steel sheet", baseUnit: "kg" });
      em.create(Material, { code: BOLT, type: "raw", description: "Bolt M8", baseUnit: "each" });
      em.create(Location, { code: A, name: "Main plant" });
      em.create(Location, { code: B, name: "Warehouse" });
      em.create(Location, { code: C, name: "Depot" });
      await em.flush();
    }
  });
  afterEach(() => orm.close());

  it("shows on-hand and in transit apart: the source lower with transit out, the destination unchanged with transit in (UX-017, INV-009)", async () => {
    await correct(STEEL, A, "100");
    await correct(BOLT, A, "7");
    await onTheRoad("30");

    expect(await report()).toEqual({
      asOf: today(), page: 1, pageSize: STOCK_REPORT_PAGE_SIZE, total: 3,
      rows: [
        {
          material: STEEL, materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg", location: A, locationName: "Main plant", locationActive: true,
          quantity: "70.000000", inTransitFrom: "30.000000", inTransitTo: "0.000000",
        },
        {
          material: STEEL, materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg", location: B, locationName: "Warehouse", locationActive: true,
          quantity: "0.000000", inTransitFrom: "0.000000", inTransitTo: "30.000000",
        },
        expect.objectContaining({ material: BOLT, location: A, quantity: "7.000000", baseUnit: "each" }),
      ],
    });
  });

  it("sums several Open transfers, drops what was received or written off, and ignores Completed and undispatched ones", async () => {
    await correct(STEEL, A, "200");
    const first = await onTheRoad("50");
    await transfers().receive(first.id, { quantity: "20", unit: "kg" }, ACTOR);
    await transfers().writeOff(first.id, { quantity: "5", unit: "kg", reason: "Damaged" }, ACTOR);
    const done = await onTheRoad("10", "10");
    await transfers().receive(done.id, { quantity: "10", unit: "kg" }, ACTOR);
    await onTheRoad("0.5");
    await transfers().create({ material: STEEL, source: A, destination: C, quantity: "9", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22" }, ACTOR);

    expect(await figures()).toEqual([
      [`${STEEL}/${A}`, "139.500000", "25.500000", "0.000000"],
      [`${STEEL}/${B}`, "30.000000", "0.000000", "25.500000"],
    ]);
  });

  it("filters by material and by location, the transit counted only at the filtered location", async () => {
    await correct(STEEL, A, "100");
    await correct(BOLT, B, "4");
    await onTheRoad("30");

    expect(await figures({ material: BOLT })).toEqual([[`${BOLT}/${B}`, "4.000000", "0.000000", "0.000000"]]);
    expect(await figures({ location: B })).toEqual([
      [`${STEEL}/${B}`, "0.000000", "0.000000", "30.000000"],
      [`${BOLT}/${B}`, "4.000000", "0.000000", "0.000000"],
    ]);
    expect(await figures({ material: STEEL, location: A })).toEqual([[`${STEEL}/${A}`, "70.000000", "30.000000", "0.000000"]]);
    expect(await figures({ material: STEEL, location: C })).toEqual([]);
  });

  it("hides a pair whose figures are all zero unless asked, and never lists a pair with no history", async () => {
    await correct(BOLT, C, "4");
    await correct(BOLT, C, "-4");

    expect((await report()).total).toBe(0);
    expect(await figures({ includeZero: "true" })).toEqual([[`${BOLT}/${C}`, "0.000000", "0.000000", "0.000000"]]);
  });

  it("marks inactive masters, whose history stays readable", async () => {
    await correct(BOLT, C, "4");
    await correct(BOLT, C, "-4");
    const em = scoped();
    (await em.findOneOrFail(Material, { code: BOLT })).active = false;
    (await em.findOneOrFail(Location, { code: C })).active = false;
    await em.flush();

    expect((await report({ includeZero: "true" })).rows).toEqual([expect.objectContaining({ material: BOLT, materialActive: false, location: C, locationActive: false })]);
  });

  it("reads only its own tenant, and a filter naming the other tenant's or an unknown record is not found (R05, TEN-014)", async () => {
    await correct(STEEL, A, "100");
    await correct(BOLT, B, "3", "test");
    const em = scoped();
    em.create(Material, { code: "00000003", type: "raw", description: "Prod only", baseUnit: "each" });
    em.create(Location, { code: "00000004", name: "Prod only" });
    await em.flush();

    expect(await figures({}, "test")).toEqual([[`${BOLT}/${B}`, "3.000000", "0.000000", "0.000000"]]);
    expect(await figures()).toEqual([[`${STEEL}/${A}`, "100.000000", "0.000000", "0.000000"]]);
    await expect(report({ material: "00000003" }, "test")).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(report({ location: "00000004" }, "test")).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
  });

  it("refuses a malformed query", async () => {
    await expect(report({ page: "0" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("reads balances and transfers in batches, and pages the rows by material, then location", async () => {
    const em = scoped();
    const materials = Array.from({ length: 6 }, (_, index) => em.create(Material, { code: String(index + 10).padStart(8, "0"), type: "raw", description: `M${index}`, baseUnit: "each" }));
    const locations = Array.from({ length: 100 }, (_, index) => em.create(Location, { code: String(index + 10).padStart(8, "0"), name: `L${index}` }));
    for (const material of materials) for (const location of locations) em.create(StockBalance, { material, location, quantity: "1.000000" });
    const [source, destination] = locations;
    for (let index = 0; index < 101; index++) {
      em.create(Transfer, {
        code: String(index + 1).padStart(8, "0"), material: materials[0], source, destination, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each",
        numerator: "1", denominator: "1", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22", dispatched: "1.000000",
      });
    }
    await em.flush();

    const first = await report();
    expect(first.total).toBe(600);
    expect(first.rows).toHaveLength(STOCK_REPORT_PAGE_SIZE);
    expect(first.rows[0]).toMatchObject({ material: "00000010", location: "00000010", quantity: "1.000000", inTransitFrom: "101.000000" });
    expect(first.rows[1]).toMatchObject({ material: "00000010", location: "00000011", inTransitTo: "101.000000" });
    const last = await report({ page: "6" });
    expect(last.rows.at(-1)).toMatchObject({ material: "00000015", location: "00000109" });
    expect((await report({ page: "7" })).rows).toEqual([]);
  });
});
