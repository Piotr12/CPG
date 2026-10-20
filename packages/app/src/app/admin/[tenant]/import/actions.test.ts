import writeXlsxFile from "write-excel-file/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { PREVIEW_TOKEN_MESSAGE, WORKBOOK_UNREADABLE_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { commitImport, dryRunImport } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const TOKEN = "e".repeat(64);
const REPORT = { committed: false, previewToken: TOKEN, summary: [], rows: [], errors: [] };

const mocks = vi.hoisted(() => ({
  importService: { dryRun: vi.fn(), commit: vi.fn() },
  bound: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
  readWorkbook: vi.fn(),
}));
// tenantServerAction's tenant, generation and transaction are core's (tenant-server-action.test.ts);
// here it parses and runs the handler as serverAction does, and records what the page bound.
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation);
        return core.serverAction(schema, (input) => handler(input, { cradle: { importService: mocks.importService } }))(raw);
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
  (await writeXlsxFile([{ sheet: "Locations", data: [["ID", "Name", "Active"], [null, "Cave", null]] }]).toBuffer()).toString("base64");

describe("import actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.importService.dryRun.mockResolvedValue(REPORT);
    mocks.importService.commit.mockResolvedValue({ ...REPORT, committed: true, previewToken: null });
  });
  afterEach(() => vi.clearAllMocks());

  it("dry-runs the prepared workbook in the bound tenant and generation, as the admin on the UI", async () => {
    await expect(dryRunImport("prod", 1, { workbook: await workbook() })).resolves.toEqual({ ok: true, data: REPORT });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    const [prepared, actor] = mocks.importService.dryRun.mock.calls[0];
    expect(prepared.locations).toEqual([{ row: 2, values: { id: null, name: "Cave", active: null } }]);
    expect(actor).toEqual(adminActor);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a normal user and a signed-out visitor before reading the workbook", async () => {
    mocks.currentUser.mockResolvedValue(alice);
    expect(await dryRunImport("prod", 1, { workbook: await workbook() })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    mocks.currentUser.mockResolvedValue(null);
    expect(await commitImport("prod", 1, { workbook: await workbook(), previewToken: TOKEN })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    expect(mocks.readWorkbook).not.toHaveBeenCalled();
    expect(mocks.bound).not.toHaveBeenCalled();
  });

  it("answers an unreadable workbook without opening the tenant's transaction", async () => {
    const result = await dryRunImport("prod", 1, { workbook: Buffer.from("not a zip").toString("base64") });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fieldErrors: { workbook: [WORKBOOK_UNREADABLE_MESSAGE] } } });
    expect(mocks.bound).not.toHaveBeenCalled();
  });

  it("commits with the dry run's token and refreshes every master-data page", async () => {
    await expect(commitImport("test", 2, { workbook: await workbook(), previewToken: TOKEN })).resolves.toMatchObject({ ok: true, data: { committed: true } });

    expect(mocks.bound).toHaveBeenCalledWith("test", 2);
    expect(mocks.importService.commit).toHaveBeenCalledWith(expect.objectContaining({ sheets: ["locations"] }), TOKEN, adminActor);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/test/materials",
      "/admin/test/locations",
      "/admin/test/customers",
      "/admin/test/suppliers",
      "/admin/test/planning-parameters",
      "/admin/test/safety-stock",
      "/admin/test/boms",
    ]);
  });

  it("needs the token, and passes a stale commit on without refreshing anything", async () => {
    expect(await commitImport("test", 2, { workbook: await workbook() })).toMatchObject({
      ok: false,
      error: { fieldErrors: { previewToken: [PREVIEW_TOKEN_MESSAGE] } },
    });

    mocks.importService.commit.mockRejectedValue(new ConflictError("Stale.", "IMPORT_STALE"));
    expect(await commitImport("test", 2, { workbook: await workbook(), previewToken: TOKEN })).toMatchObject({ ok: false, error: { code: "IMPORT_STALE" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
