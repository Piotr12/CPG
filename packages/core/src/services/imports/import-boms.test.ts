import type { MaterialType } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scopeForTenant } from "../../container/tenant-scope";
import { prepareImport } from "../../domain/imports/prepare-import";
import { inRequestTransaction } from "../../http/request-transaction";
import type { Cell } from "../../domain/imports/cells";
import { BOM_OUTPUT_IMMUTABLE_MESSAGE, RAW_OUTPUT_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import type { ComponentLine } from "../boms/bom.service";
import { ACTOR, importKit, sheet, type ImportKit } from "./import-test-kit";

/*
 * The import's BOM sheets on a real SQLite file (spec 2026-10-20--0908UTC-master-data-bom-import,
 * Q8): XLS-008, XLS-017…028.
 */

let kit: ImportKit;

beforeEach(async () => {
  kit = await importKit();
  await kit.write(async ({ materialService }) => {
    const material = (type: MaterialType, description: string, baseUnit: string) => materialService.create({ type, description, baseUnit }, ACTOR);
    await material("raw", "Steel sheet", "kg"); // 00000001
    await material("raw", "Bolt M8", "each"); // 00000002
    await material("raw", "Paint", "l"); // 00000003
    await material("intermediate", "Panel", "each"); // 00000004
    await material("finished", "Cabinet", "each"); // 00000005
    await material("intermediate", "Frame", "each"); // 00000006
    await materialService.addConversion("00000003", { unit: "ml", numerator: "1", denominator: "1000" }, ACTOR);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await kit.orm.close();
});

/** A header row: BOM ID, import reference, output, priority 1 from 2027-01-01 with no end, active. */
const header = (id: Cell, reference: Cell, output: Cell = 5, overrides: { priority?: Cell; active?: Cell; through?: Cell } = {}): Cell[] => [
  id,
  reference,
  output,
  overrides.priority ?? 1,
  "2027-01-01",
  overrides.through ?? null,
  overrides.active ?? null,
];

const line = (bom: Cell, material: Cell, quantity: Cell, unit: Cell = null): Cell[] => [bom, material, quantity, unit];

const recipe = (material: string, quantity: string, unit: string): ComponentLine => ({ material, quantity, unit });

/** BOM 00000001: Panel from 2 kg steel, 1 bolt and 250 ml paint, priority 1 from 2027-01-01. */
async function seedPanelBom() {
  await kit.write(({ bomService }) =>
    bomService.create(
      {
        output: "00000004",
        priority: 1,
        validFrom: "2027-01-01",
        validThrough: null,
        components: [recipe("00000001", "2", "kg"), recipe("00000002", "1", "each"), recipe("00000003", "250", "ml")],
      },
      ACTOR,
    ),
  );
}

const bom = (id: string) => kit.write(({ bomService }) => bomService.get(id));
const revision = (id: string, number: number) => kit.write(({ bomService }) => bomService.getRevision(id, number));
const quantities = (components: { material: string; quantity: string }[]) => components.map(({ material, quantity }) => `${material} ${quantity}`);

describe("new BOMs", () => {
  it("binds a new header and its lines through the import reference (XLS-018)", async () => {
    const workbook = [
      sheet("bomHeaders", header(null, "RECIPE-X", 4)),
      sheet("bomLines", line("RECIPE-X", 1, 4.5, "kg"), line("RECIPE-X", 3, "250", "ml"), line("RECIPE-X", 2, 2)),
    ];
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.errors).toEqual([]);
    expect(dryRun.rows).toEqual([
      {
        sheet: "BOM headers",
        row: 2,
        action: "create",
        record: "00000001",
        reference: "RECIPE-X",
        label: "00000001 — 00000004 Panel",
        changes: [
          { field: "Output material ID", before: null, after: "00000004" },
          { field: "Priority", before: null, after: 1 },
          { field: "Valid from", before: null, after: "2027-01-01" },
          { field: "Valid through", before: null, after: null },
          { field: "Component 00000001", before: null, after: "4.500000 kg" },
          { field: "Component 00000003", before: null, after: "0.250000 l" },
          { field: "Component 00000002", before: null, after: "2.000000 each" },
        ],
      },
    ]);
    expect(dryRun.summary).toEqual([
      { sheet: "BOM headers", created: 1, updated: 0, unchanged: 0, errors: 0 },
      { sheet: "BOM lines", created: 0, updated: 0, unchanged: 0, errors: 0 },
    ]);

    await kit.commit(workbook, dryRun.previewToken!);
    const created = await bom("00000001");
    expect([created.output, created.revision, quantities(created.components)]).toEqual([
      "00000004",
      1,
      ["00000001 4.500000", "00000003 0.250000", "00000002 2.000000"],
    ]);
  });

  it("creates two alternatives in one upload, each with its own lines (XLS-019), or refuses both on a priority clash (XLS-023)", async () => {
    const lines = sheet("bomLines", line("RECIPE-A", 4, 4), line("RECIPE-B", 4, 2), line("RECIPE-B", 2, 8));
    const clash = [sheet("bomHeaders", header(null, "RECIPE-A"), header(null, "RECIPE-B")), lines];
    const refused = await kit.dryRun(clash);
    expect(refused.errors).toEqual([
      expect.objectContaining({ sheet: "BOM headers", row: 3, column: "Priority", code: "BOM_PRIORITY_CONFLICT" }),
    ]);
    await expect(kit.commit(clash, "a".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE" });

    const workbook = [sheet("bomHeaders", header(null, "RECIPE-A"), header(null, "RECIPE-B", 5, { priority: 2 })), lines];
    const dryRun = await kit.dryRun(workbook);
    await kit.commit(workbook, dryRun.previewToken!);
    expect(quantities((await bom("00000001")).components)).toEqual(["00000004 4.000000"]);
    expect(quantities((await bom("00000002")).components)).toEqual(["00000004 2.000000", "00000002 8.000000"]);
    expect([(await bom("00000001")).revision, (await bom("00000002")).revision]).toEqual([1, 1]);
  });

  it("reports every line whose material doesn't exist, on its own row, and an unknown output (XLS-008)", async () => {
    const report = await kit.dryRun([
      sheet("bomHeaders", header(null, "R1", 99), header(null, "R2", 4)),
      sheet("bomLines", line("R1", 1, 1), line("R2", 41, 1), line("R2", 1, 1), line("R2", 42, 1)),
    ]);
    expect(report.errors.map((error) => [error.sheet, error.row, error.column, error.code, error.params])).toEqual([
      ["BOM headers", 2, "Output material ID", "IMPORT_MISSING_REFERENCE", { id: "00000099" }],
      ["BOM lines", 3, "Component material ID", "IMPORT_MISSING_REFERENCE", { id: "00000041" }],
      ["BOM lines", 5, "Component material ID", "IMPORT_MISSING_REFERENCE", { id: "00000042" }],
    ]);
  });

  it("uses materials an earlier sheet creates, whatever the tab order (XLS-008)", async () => {
    const workbook = [
      sheet("bomLines", line("R1", 7, 3)),
      sheet("bomHeaders", header(null, "R1", 6)),
      sheet("materials", [null, "raw", "Rivet", "each", null]),
    ];
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.errors).toEqual([]);
    expect(dryRun.rows.map((row) => [row.sheet, row.record])).toEqual([
      ["Materials", "00000007"],
      ["BOM headers", "00000001"],
    ]);
  });

  it("lets a fatal failure loading a line's material through", async () => {
    const scope = await scopeForTenant(kit.container, "prod");
    vi.spyOn(scope.cradle.materialService, "get").mockRejectedValue(new Error("database gone"));
    const workbook = prepareImport([sheet("bomHeaders", header(null, "R1", 4)), sheet("bomLines", line("R1", 1, 1))]);

    await expect(inRequestTransaction(scope.cradle.em, () => scope.cradle.importService.dryRun(workbook, ACTOR))).rejects.toThrow("database gone");
  });

  it("places the service's field errors on their header or line cell", async () => {
    const report = await kit.dryRun([sheet("bomHeaders", header(null, "R1", 1), header(null, "R2", 4)), sheet("bomLines", line("R1", 2, 1), line("R2", 1, 1, "case"))]);
    expect(report.errors).toEqual([
      { sheet: "BOM headers", row: 2, column: "Output material ID", code: "VALIDATION_FAILED", message: RAW_OUTPUT_MESSAGE },
      { sheet: "BOM lines", row: 3, column: "Unit", code: "VALIDATION_FAILED", message: UNIT_NOT_CONVERTIBLE_MESSAGE },
    ]);
  });
});

describe("existing BOMs", () => {
  beforeEach(seedPanelBom);

  /** The panel BOM's header and its lines, as given. */
  const panel = (lines: Cell[][], options: Parameters<typeof header>[3] = {}) => [
    sheet("bomHeaders", header(1, null, null, options)),
    sheet("bomLines", ...lines.map((cells) => line(1, ...(cells as [Cell, Cell, Cell?])))),
  ];
  const SAME = [
    [1, 2, "kg"],
    [2, 1],
    [3, "0.25", "l"],
  ];

  it("records nothing for an identical recipe, in another order and unit (XLS-022)", async () => {
    const audits = await kit.auditCount();
    const workbook = panel([[3, "0.25", "l"], [2, 1], [1, 2, "kg"]]);
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows).toEqual([{ sheet: "BOM headers", row: 2, action: "unchanged", record: "00000001", label: "00000001 — 00000004 Panel", changes: [] }]);
    await kit.commit(workbook, dryRun.previewToken!);
    expect((await bom("00000001")).revision).toBe(1);
    expect(await kit.auditCount()).toBe(audits);
  });

  it("makes the next revision for a changed recipe and keeps the older ones, under the same ID (XLS-020, XLS-021, XLS-025, XLS-027)", async () => {
    await kit.write(async ({ bomService }) => {
      const current = await bomService.get("00000001");
      await bomService.update("00000001", { priority: 2 }, current.version, ACTOR);
    });
    const workbook = panel(
      [
        [1, "2.5", "kg"],
        [6, 1],
      ],
      { priority: 2 },
    );
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows[0].changes).toEqual([
      { field: "Revision", before: 2, after: 3 },
      { field: "Component 00000001", before: "2.000000 kg", after: "2.500000 kg" },
      { field: "Component 00000006", before: null, after: "1.000000 each" },
      { field: "Component 00000002", before: "1.000000 each", after: null },
      { field: "Component 00000003", before: "0.250000 l", after: null },
    ]);

    await kit.commit(workbook, dryRun.previewToken!);
    const after = await bom("00000001");
    expect([after.id, after.revision, quantities(after.components)]).toEqual(["00000001", 3, ["00000001 2.500000", "00000006 1.000000"]]);
    expect(quantities((await revision("00000001", 2)).components)).toEqual(["00000001 2.000000", "00000002 1.000000", "00000003 0.250000"]);
    expect((await revision("00000001", 1)).priority).toBe(1);
  });

  it("toggles the active flag of an unchanged recipe without a revision (XLS-028)", async () => {
    const workbook = panel(SAME, { active: "no" });
    const dryRun = await kit.dryRun(workbook);
    expect(dryRun.rows[0]).toMatchObject({ action: "update", changes: [{ field: "Active", before: true, after: false }] });
    await kit.commit(workbook, dryRun.previewToken!);
    expect([(await bom("00000001")).active, (await bom("00000001")).revision]).toEqual([false, 1]);
  });

  it("names a header's import reference in its outcome, and refuses a changed output or an unknown ID", async () => {
    const named = await kit.dryRun([sheet("bomHeaders", header(1, "PANEL", null)), sheet("bomLines", ...SAME.map((cells) => line("PANEL", ...(cells as [Cell, Cell, Cell?]))))]);
    expect(named.rows[0]).toMatchObject({ action: "unchanged", reference: "PANEL" });

    const report = await kit.dryRun([
      sheet("bomHeaders", header(1, null, 5), header(9, null, null)),
      sheet("bomLines", line(1, 1, 2, "kg"), line(9, 1, 1)),
    ]);
    expect(report.errors).toEqual([
      { sheet: "BOM headers", row: 2, column: "Output material ID", code: "VALIDATION_FAILED", message: BOM_OUTPUT_IMMUTABLE_MESSAGE },
      {
        sheet: "BOM headers",
        row: 3,
        column: "BOM ID",
        code: "IMPORT_UNKNOWN_ID",
        message: "BOM 00000009 doesn't exist in Prod. Leave the ID blank to create a new BOM.",
        params: { id: "00000009" },
      },
    ]);
  });

  it("refuses a recipe that closes a cycle, with its path, and applies nothing (XLS-024, XLS-026)", async () => {
    await kit.write(({ bomService }) =>
      bomService.create({ output: "00000006", priority: 1, validFrom: "2027-01-01", validThrough: null, components: [recipe("00000004", "1", "each")] }, ACTOR),
    );
    const workbook = [
      sheet("materials", [null, "raw", "Glue", "kg", null]),
      sheet("bomHeaders", header(1, null, null)),
      sheet("bomLines", line(1, 1, 2, "kg"), line(1, 6, 1)),
    ];
    const report = await kit.dryRun(workbook);
    expect(report.errors).toEqual([
      expect.objectContaining({ sheet: "BOM headers", row: 2, column: null, code: "BOM_CYCLE", message: expect.stringContaining("→(BOM 00000002)") }),
    ]);
    await expect(kit.commit(workbook, "c".repeat(64))).rejects.toMatchObject({ code: "IMPORT_STALE" });
    expect((await kit.write(({ materialService }) => materialService.list())).length).toBe(6);
    expect((await bom("00000001")).revision).toBe(1);
  });
});
