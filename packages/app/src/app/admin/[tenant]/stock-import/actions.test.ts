import writeXlsxFile from "write-excel-file/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { PREVIEW_TOKEN_MESSAGE, WORKBOOK_UNREADABLE_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { commitStockImport, dryRunStockImport } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const TOKEN = "e".repeat(64);
const REPORT = { committed: false, previewToken: TOKEN, summary: [], rows: [], errors: [] };

const mocks = vi.hoisted(() => ({
  stockImportService: { dryRun: vi.fn(), commit: vi.fn() },
  bound: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
  readWorkbook: vi.fn(),
}));
// tenantServerAction's tenant, generation, read-only gate and transaction are core's
// (tenant-server-action.test.ts); here it parses and runs the handler, and records what the page bound.
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation);
        return core.serverAction(schema, (input) => handler(input, { cradle: { stockImportService: mocks.stockImportService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("../../../../components/imports/workbook-file", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../components/imports/workbook-file")>();
  mocks.readWorkbook.mockImplementation(original.readWorkbook);
  return { ...original, readWorkbook: mocks.readWorkbook };
});

const workbook = async () =>
  (await writeXlsxFile([{ sheet: "Stock", data: [["Material ID", "Location ID", "Physical quantity", "Unit"], ["00000001", "00000001", 85, null]] }]).toBuffer()).toString("base64");

describe("stock import actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.stockImportService.dryRun.mockResolvedValue(REPORT);
    mocks.stockImportService.commit.mockResolvedValue({ ...REPORT, committed: true, previewToken: null });
  });
  afterEach(() => vi.clearAllMocks());

  it("dry-runs the prepared workbook in the bound tenant and generation, for a normal user", async () => {
    await expect(dryRunStockImport("prod", 1, { workbook: await workbook() })).resolves.toEqual({ ok: true, data: REPORT });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.stockImportService.dryRun).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [{ row: 2, values: { material: "00000001", location: "00000001", quantity: "85.000000", unit: null } }] }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor before reading the workbook", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await dryRunStockImport("prod", 1, { workbook: await workbook() })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await commitStockImport("prod", 1, { workbook: await workbook(), previewToken: TOKEN, reason: "Count" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    expect(mocks.readWorkbook).not.toHaveBeenCalled();
    expect(mocks.bound).not.toHaveBeenCalled();
  });

  it("answers an unreadable workbook without opening the tenant's transaction", async () => {
    const result = await dryRunStockImport("prod", 1, { workbook: Buffer.from("not a zip").toString("base64") });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fieldErrors: { workbook: [WORKBOOK_UNREADABLE_MESSAGE] } } });
    expect(mocks.bound).not.toHaveBeenCalled();
  });

  it("commits with the dry run's token, the reason and the user, and refreshes the Stock page", async () => {
    await expect(commitStockImport("test", 2, { workbook: await workbook(), previewToken: TOKEN, reason: " Stock count " })).resolves.toMatchObject({
      ok: true,
      data: { committed: true },
    });

    expect(mocks.bound).toHaveBeenCalledWith("test", 2);
    expect(mocks.stockImportService.commit).toHaveBeenCalledWith(expect.objectContaining({ hasStockSheet: true }), TOKEN, "Stock count", aliceActor);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(["/admin/test/stock"]);
  });

  it("needs the token and a reason, and passes a stale commit on without refreshing anything (STX-014, STX-016)", async () => {
    expect(await commitStockImport("test", 2, { workbook: await workbook() })).toMatchObject({
      ok: false,
      error: { fieldErrors: { previewToken: [PREVIEW_TOKEN_MESSAGE], reason: [STOCK_REASON_MESSAGE] } },
    });
    expect(mocks.readWorkbook).not.toHaveBeenCalled();

    mocks.stockImportService.commit.mockRejectedValue(new ConflictError("Stale.", "IMPORT_STALE"));
    expect(await commitStockImport("test", 2, { workbook: await workbook(), previewToken: TOKEN, reason: "Count" })).toMatchObject({
      ok: false,
      error: { code: "IMPORT_STALE" },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
