import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scopeForTenant } from "../../container/tenant-scope";
import { prepareImport } from "../../domain/imports/prepare-import";
import { inRequestTransaction } from "../../http/request-transaction";
import { TYPE_MESSAGE } from "../../validators/materials/material-fields.schema";
import { RAW_MATERIAL_BUY_ONLY_MESSAGE } from "../../validators/planning-parameters/planning-parameter-fields.schema";
import { seedResetDemoData } from "../demo/seed-demo-data";
import { IMPORT_STALE_MESSAGE } from "./import.service";
import { ACTOR, importKit, sheet, type ImportKit } from "./import-test-kit";

/*
 * The import's engine on a real SQLite file (spec 2026-10-20--0908UTC-master-data-bom-import), the
 * master sheets: XLS-002…016. The BOM sheets are in import-boms.test.ts.
 */

let kit: ImportKit;

beforeEach(async () => {
  kit = await importKit();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await kit.orm.close();
});

/** Materials 00000001 (raw, kg) and 00000002 (raw, each) and location 00000001, in the tenant. */
async function seedMasters(tenant: "test" | "prod" = "prod") {
  await kit.write(async ({ materialService, locationService }) => {
    await materialService.create({ type: "raw", description: "Steel sheet", baseUnit: "kg" }, ACTOR);
    await materialService.create({ type: "raw", description: "Bolt M8", baseUnit: "each" }, ACTOR);
    await locationService.create({ name: "Main cave" }, ACTOR);
  }, tenant);
}

const materials = (tenant: "test" | "prod" = "prod") => kit.write(({ materialService }) => materialService.list(), tenant);
const descriptions = async (tenant: "test" | "prod" = "prod") => (await materials(tenant)).map((material) => `${material.id} ${material.description}`);

describe("the dry run and the commit", () => {
  it("assigns the next material ID to a blank ID, shows it, and writes nothing until the commit (XLS-002, XLS-010)", async () => {
    await seedMasters();
    const audits = await kit.auditCount();
    const workbook = [sheet("materials", [null, "intermediate", "Painted side panel", "each", null])];

    const dryRun = await kit.dryRun(workbook);

    expect(dryRun.committed).toBe(false);
    expect(dryRun.errors).toEqual([]);
    expect(dryRun.previewToken).toMatch(/^[0-9a-f]{64}$/);
    expect(dryRun.rows).toEqual([
      {
        sheet: "Materials",
        row: 2,
        action: "create",
        record: "00000003",
        label: "00000003 — Painted side panel",
        changes: [
          { field: "Type", before: null, after: "intermediate" },
          { field: "Description", before: null, after: "Painted side panel" },
          { field: "Base unit", before: null, after: "each" },
          { field: "Active", before: null, after: true },
        ],
      },
    ]);
    expect(dryRun.summary).toEqual([{ sheet: "Materials", created: 1, updated: 0, unchanged: 0, errors: 0 }]);
    expect(await descriptions()).toEqual(["00000001 Steel sheet", "00000002 Bolt M8"]);
    expect(await kit.auditCount()).toBe(audits);

    const commit = await kit.commit(workbook, dryRun.previewToken!);

    expect(commit).toEqual({ ...dryRun, committed: true, previewToken: null });
    expect(await descriptions()).toEqual(["00000001 Steel sheet", "00000002 Bolt M8", "00000003 Painted side panel"]);
    expect(await kit.auditCount()).toBe(audits + 1);
  });

  it("updates the record a known ID names, audited, and labels create, update and unchanged (XLS-003, XLS-011)", async () => {
    await seedMasters();
    const audits = await kit.auditCount();
    const workbook = [
      sheet(
        "materials",
        [1, "raw", "Steel sheet 2 mm", "kg", null],
        ["00000002", "raw", "Bolt M8", "each", "yes"],
        [null, "finished", "Cabinet", "each", null],
      ),
    ];

    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows.map(({ action, record, changes }) => [action, record, changes])).toEqual([
      ["update", "00000001", [{ field: "Description", before: "Steel sheet", after: "Steel sheet 2 mm" }]],
      ["unchanged", "00000002", []],
      ["create", "00000003", expect.any(Array)],
    ]);
    expect(dryRun.summary).toEqual([{ sheet: "Materials", created: 1, updated: 1, unchanged: 1, errors: 0 }]);

    await kit.commit(workbook, dryRun.previewToken!);
    expect(await descriptions()).toEqual(["00000001 Steel sheet 2 mm", "00000002 Bolt M8", "00000003 Cabinet"]);
    // One for the update, one for the create; the unchanged row records nothing.
    expect(await kit.auditCount()).toBe(audits + 2);
  });

  it("reports an unknown explicit ID with the advice to leave it blank (XLS-004)", async () => {
    const report = await kit.dryRun([sheet("materials", [9876, "raw", "Rod", "kg", null])]);
    expect(report.errors).toEqual([
      {
        sheet: "Materials",
        row: 2,
        column: "ID",
        code: "IMPORT_UNKNOWN_ID",
        message: "Material 00009876 doesn't exist in Prod. Leave the ID blank to create a new material.",
        params: { id: "00009876", record: "material" },
      },
    ]);
    expect(report.previewToken).toBeNull();
    expect(report.summary).toEqual([{ sheet: "Materials", created: 0, updated: 0, unchanged: 0, errors: 1 }]);
  });

  it("reports every error at once, in sheet and row order, and writes nothing (XLS-005, XLS-006, XLS-007, XLS-009)", async () => {
    await seedMasters();
    const report = await kit.dryRun([
      sheet("planningParameters", [1, 99, "buy", 1, 0, 1]),
      sheet("materials", [2, "raw", "A", "kg", null], [null, null, "B", "kg", "maybe"], [2, "raw", "C", "kg", null]),
      { name: "Notes", rows: [["x"]] },
    ]);
    expect(report.errors.map((error) => [error.sheet, error.row, error.column, error.code])).toEqual([
      ["Materials", 2, "ID", "IMPORT_DUPLICATE_KEY"],
      ["Materials", 3, "Type", "VALIDATION_FAILED"],
      ["Materials", 3, "Active", "VALIDATION_FAILED"],
      ["Materials", 4, "ID", "IMPORT_DUPLICATE_KEY"],
      ["Planning parameters", 2, "Location ID", "IMPORT_MISSING_REFERENCE"],
      ["Notes", 1, null, "IMPORT_UNKNOWN_SHEET"],
    ]);
    expect(report.errors[1].message).toBe(TYPE_MESSAGE);
    expect(report.errors[4].message).toBe(
      "Location 00000099 doesn't exist in Prod. Create or import it first: a row can only use records that exist, or that an earlier sheet of this workbook creates.",
    );
    expect(report.previewToken).toBeNull();
    expect(await descriptions()).toEqual(["00000001 Steel sheet", "00000002 Bolt M8"]);
  });

  it("refuses a commit whose workbook had errors, or whose token isn't the dry run's (XLS-012, XLS-013)", async () => {
    await seedMasters();
    const broken = [sheet("materials", [null, "raw", "Good", "kg", null], [9876, "raw", "Bad", "kg", null])];
    await expect(kit.commit(broken, "a".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE", message: IMPORT_STALE_MESSAGE });

    const clean = [sheet("materials", [null, "raw", "Good", "kg", null])];
    await expect(kit.commit(clean, "b".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE" });
    expect(await descriptions()).toEqual(["00000001 Steel sheet", "00000002 Bolt M8"]);
  });

  it("refuses the commit when a record the workbook updates was edited since the dry run, and keeps that edit (XLS-014)", async () => {
    await seedMasters();
    const workbook = [sheet("materials", [1, "raw", "From the workbook", "kg", null], [null, "raw", "New", "kg", null])];
    const { previewToken } = await kit.dryRun(workbook);
    await kit.write(async ({ materialService }) => {
      const material = await materialService.get("00000001");
      await materialService.update("00000001", { description: "Edited meanwhile" }, material.version, ACTOR);
    });

    await expect(kit.commit(workbook, previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE" });
    expect(await descriptions()).toEqual(["00000001 Edited meanwhile", "00000002 Bolt M8"]);
  });

  it("refuses the commit when a record referenced by a row changed, or a new record would get another ID", async () => {
    await seedMasters();
    const planning = [sheet("planningParameters", [1, 1, "buy", 1, 0, 1])];
    const first = await kit.dryRun(planning);
    await kit.write(async ({ locationService }) => locationService.update("00000001", { name: "Renamed" }, 1, ACTOR));
    await expect(kit.commit(planning, first.previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE" });

    const creating = [sheet("materials", [null, "raw", "New", "kg", null])];
    const second = await kit.dryRun(creating);
    await kit.write(async ({ materialService }) => materialService.create({ type: "raw", description: "Elsewhere", baseUnit: "kg" }, ACTOR));
    await expect(kit.commit(creating, second.previewToken!)).rejects.toMatchObject({ code: "IMPORT_STALE" });
    expect(await descriptions()).toEqual(["00000001 Steel sheet", "00000002 Bolt M8", "00000003 Elsewhere"]);
  });

  it("changes only the tenant it runs in (XLS-016)", async () => {
    await seedMasters("test");
    await seedMasters("prod");
    const workbook = [sheet("materials", [1, "raw", "Test's steel", "kg", null])];
    const { previewToken } = await kit.dryRun(workbook, "test");
    await kit.commit(workbook, previewToken!, "test");

    expect(await descriptions("test")).toEqual(["00000001 Test's steel", "00000002 Bolt M8"]);
    expect(await descriptions("prod")).toEqual(["00000001 Steel sheet", "00000002 Bolt M8"]);
  });

  it("never resolves a reference in the other tenant (TEN-014)", async () => {
    // Prod has materials 00000001 and 00000002 and location 00000001; Test only material 00000001.
    await seedMasters("prod");
    await kit.write(({ materialService }) => materialService.create({ type: "raw", description: "Test's steel", baseUnit: "kg" }, ACTOR), "test");
    const testAudits = await kit.auditCount("test");
    const prodAudits = await kit.auditCount("prod");
    const report = await kit.dryRun([sheet("planningParameters", [1, 1, "buy", 1, 0, 1], [2, 1, "buy", 1, 0, 1])], "test");
    expect(report.errors.map((error) => [error.row, error.column, error.code, error.message])).toEqual([
      [2, "Location ID", "IMPORT_MISSING_REFERENCE", expect.stringContaining("Location 00000001 doesn't exist in Test.")],
      [3, "Material ID", "IMPORT_MISSING_REFERENCE", expect.stringContaining("Material 00000002 doesn't exist in Test.")],
    ]);
    expect(report.previewToken).toBeNull();
    expect([await kit.auditCount("test"), await kit.auditCount("prod")]).toEqual([testAudits, prodAudits]);
  });

  it("lets a later sheet use what an earlier sheet creates, by the ID the dry run shows (spec Q4)", async () => {
    await seedMasters();
    const workbook = [
      sheet("materials", [null, "intermediate", "Panel", "each", null]),
      sheet("locations", [null, "Second cave", null]),
      sheet("planningParameters", [3, 2, "make", 2, 0, 1]),
    ];
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.errors).toEqual([]);
    expect(dryRun.rows.map((row) => [row.sheet, row.record, row.label])).toEqual([
      ["Materials", "00000003", "00000003 — Panel"],
      ["Locations", "00000002", "00000002 — Second cave"],
      ["Planning parameters", "00000003/00000002", "00000003 Panel at 00000002 Second cave"],
    ]);
    await kit.commit(workbook, dryRun.previewToken!);
    expect(await kit.write(({ planningParameterService }) => planningParameterService.list())).toEqual([
      expect.objectContaining({ material: "00000003", location: "00000002", procurement: "make", leadTimeDays: 2 }),
    ]);
  });

  it("lets a fatal error through instead of reporting it on a row", async () => {
    const scope = await scopeForTenant(kit.container, "prod");
    vi.spyOn(scope.cradle.materialService, "create").mockRejectedValue(new Error("disk full"));
    const workbook = prepareImport([sheet("materials", [null, "raw", "X", "kg", null])]);

    await expect(inRequestTransaction(scope.cradle.em, () => scope.cradle.importService.dryRun(workbook, ACTOR))).rejects.toThrow("disk full");
  });
});

describe("each master sheet", () => {
  it("keeps or sets the active flag of an existing record", async () => {
    await seedMasters();
    const workbook = [sheet("materials", [1, "raw", "Steel sheet", "kg", "no"], [2, "raw", "Bolt M8", "each", null])];
    const { previewToken, rows } = await kit.dryRun(workbook);
    expect(rows.map((row) => [row.record, row.action, row.changes])).toEqual([
      ["00000001", "update", [{ field: "Active", before: true, after: false }]],
      ["00000002", "unchanged", []],
    ]);
    await kit.commit(workbook, previewToken!);
    expect((await materials()).map((material) => material.active)).toEqual([false, true]);
  });

  it("places a service's refusal on its column: a type locked by a BOM, Make on a raw material, an inactive location", async () => {
    await seedMasters();
    await kit.write(async ({ materialService, locationService, bomService }) => {
      await materialService.create({ type: "finished", description: "Cabinet", baseUnit: "each" }, ACTOR);
      await bomService.create({ output: "00000003", priority: 1, validFrom: "2027-01-01", validThrough: null, components: [{ material: "00000001", quantity: "1", unit: "kg" }] }, ACTOR);
      await locationService.create({ name: "Closed cave" }, ACTOR);
      await locationService.update("00000002", { active: false }, 1, ACTOR);
    });

    const report = await kit.dryRun([
      sheet("materials", [1, "intermediate", "Steel sheet", "kg", null]),
      sheet("planningParameters", [1, 1, "make", 1, 0, 1], [2, 2, "buy", 1, 0, 1]),
    ]);

    expect(report.errors.map((error) => [error.sheet, error.row, error.column, error.code])).toEqual([
      ["Materials", 2, "Type", "MATERIAL_TYPE_IN_USE"],
      ["Planning parameters", 2, "Procurement", "VALIDATION_FAILED"],
      ["Planning parameters", 3, "Location ID", "LOCATION_INACTIVE"],
    ]);
    expect(report.errors[1].message).toBe(RAW_MATERIAL_BUY_ONLY_MESSAGE);
  });

  it("adds a unit conversion, changes an existing one's factor, and refuses the base unit", async () => {
    await seedMasters();
    await kit.write(({ materialService }) => materialService.addConversion("00000002", { unit: "box", numerator: "6", denominator: "1" }, ACTOR));

    const refused = await kit.dryRun([sheet("unitConversions", [1, "kg", 1, 1], [7, "case", 1, 1])]);
    expect(refused.errors).toEqual([
      { sheet: "Unit conversions", row: 2, column: "Unit", code: "UNIT_IS_BASE_UNIT", message: "kg is this material's base unit: it needs no conversion." },
      expect.objectContaining({ row: 3, column: "Material ID", code: "IMPORT_MISSING_REFERENCE" }),
    ]);

    const workbook = [sheet("unitConversions", [2, "case", 12, 1], [2, "box", "10", "1"])];
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows.map(({ action, record, label, changes }) => [action, record, label, changes])).toEqual([
      [
        "create",
        "00000002/case",
        "00000002 — Bolt M8: case",
        [
          { field: "Numerator", before: null, after: "12" },
          { field: "Denominator", before: null, after: "1" },
        ],
      ],
      ["update", "00000002/box", "00000002 — Bolt M8: box", [{ field: "Numerator", before: "6", after: "10" }]],
    ]);
    await kit.commit(workbook, dryRun.previewToken!);
    const bolt = await kit.write(({ materialService }) => materialService.get("00000002"));
    expect(bolt.conversions.map(({ unit, numerator }) => [unit, numerator])).toEqual([
      ["box", "10"],
      ["case", "12"],
    ]);

    expect((await kit.dryRun([sheet("unitConversions", [2, "case", "12.0", 1])])).rows.map((row) => row.action)).toEqual(["unchanged"]);
  });

  it("creates and updates locations, customers and suppliers, and reports an unknown ID", async () => {
    await seedMasters();
    const workbook = [
      sheet("locations", [1, "Main cave", "no"]),
      sheet("customers", [null, "Stone Age Retail", null]),
      sheet("suppliers", [null, "Flint & Co", null], [5, "Nobody", null]),
    ];
    const report = await kit.dryRun(workbook);
    expect(report.rows.map(({ sheet: name, action, record, label }) => [name, action, record, label])).toEqual([
      ["Locations", "update", "00000001", "00000001 — Main cave"],
      ["Customers", "create", "00000001", "00000001 — Stone Age Retail"],
      ["Suppliers", "create", "00000001", "00000001 — Flint & Co"],
    ]);
    expect(report.errors).toEqual([
      expect.objectContaining({
        sheet: "Suppliers",
        row: 3,
        code: "IMPORT_UNKNOWN_ID",
        message: "Supplier 00000005 doesn't exist in Prod. Leave the ID blank to create a new supplier.",
      }),
    ]);

    const clean = workbook.slice(0, 2);
    await kit.commit(clean, (await kit.dryRun(clean)).previewToken!);
    expect(await kit.write(({ locationService }) => locationService.list())).toEqual([expect.objectContaining({ id: "00000001", active: false })]);
    expect(await kit.write(({ customerService }) => customerService.list())).toEqual([expect.objectContaining({ name: "Stone Age Retail" })]);
    const unchanged = await kit.dryRun([sheet("locations", [1, "Main cave", null])]);
    expect(unchanged.rows[0].action).toBe("unchanged");
  });

  it("creates and updates planning parameters and safety-stock targets", async () => {
    await seedMasters();
    await kit.write(({ planningParameterService }) =>
      planningParameterService.create({ material: "00000001", location: "00000001", procurement: "buy", leadTimeDays: 3, minimumQuantity: "0.000000", lotMultiple: "1.000000" }, ACTOR),
    );
    const workbook = [
      sheet("planningParameters", [1, 1, "buy", 5, 0, 1], [2, 1, "buy", 1, "10", "5"]),
      sheet("safetyStock", [1, 1, "2027-01-01", 100]),
    ];
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows.map(({ action, record, label, changes }) => [action, record, label, changes])).toEqual([
      ["update", "00000001/00000001", "00000001 Steel sheet at 00000001 Main cave", [{ field: "Lead time days", before: 3, after: 5 }]],
      ["create", "00000002/00000001", "00000002 Bolt M8 at 00000001 Main cave", expect.any(Array)],
      ["create", "00000001/00000001/2027-01-01", "00000001 Steel sheet at 00000001 Main cave from 2027-01-01", [{ field: "Quantity", before: null, after: "100.000000" }]],
    ]);
    await kit.commit(workbook, dryRun.previewToken!);

    const next = [sheet("safetyStock", [1, 1, "2027-01-01", 150]), sheet("planningParameters", [1, 1, "buy", 5, 0, 1])];
    const second = await kit.dryRun(next);
    expect(second.rows.map(({ action, changes }) => [action, changes])).toEqual([
      ["unchanged", []],
      ["update", [{ field: "Quantity", before: "100.000000", after: "150.000000" }]],
    ]);
    expect((await kit.dryRun([sheet("safetyStock", [1, 1, "2027-01-01", "100.0"])])).rows[0].action).toBe("unchanged");
    await kit.commit(next, second.previewToken!);
    expect(await kit.write(({ safetyStockTargetService }) => safetyStockTargetService.list())).toEqual([expect.objectContaining({ quantity: "150.000000" })]);
    expect((await kit.dryRun([sheet("safetyStock", [9, 1, "2027-01-01", 1])])).errors[0]).toMatchObject({ column: "Material ID", code: "IMPORT_MISSING_REFERENCE" });
  });
});


it("invalidates an old preview even when the request scope predates reset and the transaction uses the new generation", async () => {
  const workbook = [sheet("materials", [null, "raw", "same deterministic input", "kg", null])];
  await seedResetDemoData((await scopeForTenant(kit.container, "test")).cradle);
  const old = await kit.dryRun(workbook, "test");
  const captured = await scopeForTenant(kit.container, "test");
  expect(captured.cradle.tenant.generation).toBe(1);
  await (await scopeForTenant(kit.container, "test")).cradle.testResetService.reset(1, ACTOR);
  // Reproduce equal business inputs/IDs across generations: a blank dry run has no read versions.
  await expect(inRequestTransaction(captured.cradle.em, () => captured.cradle.importService.commit(prepareImport(workbook), old.previewToken!, ACTOR)))
    .rejects.toMatchObject({ code: "IMPORT_STALE" });
});
