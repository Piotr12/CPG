import writeXlsxFile from "write-excel-file/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKBOOK_REQUIRED_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "bob", role: "user", tokenId: "t2", tokenName: "scanner" } as const;

const mocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/stock-import/dry-run", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod" }),
  });

const workbook = async () =>
  (await writeXlsxFile([{ sheet: "Stock", data: [["Material ID", "Location ID", "Physical quantity", "Unit"], ["00000001", "00000001", 85, null]] }]).toBuffer()).toString("base64");

describe("POST /api/tenants/{tenant}/stock-import/dry-run", () => {
  afterEach(() => vi.clearAllMocks());

  it("dry-runs the prepared rows for a normal user's token", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { stockImportService: { dryRun: mocks.dryRun } };
    mocks.dryRun.mockResolvedValue({ committed: false });

    const response = await post({ workbook: await workbook() });

    expect(await response.json()).toEqual({ ok: true, data: { committed: false } });
    expect(mocks.dryRun).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [{ row: 2, values: { material: "00000001", location: "00000001", quantity: "85.000000", unit: null } }] }),
    );
  });

  it("needs a workbook", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({});

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toEqual({ workbook: [WORKBOOK_REQUIRED_MESSAGE] });
    expect(mocks.dryRun).not.toHaveBeenCalled();
  });
});
