import writeXlsxFile from "write-excel-file/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_TOKEN_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "bob", role: "user", tokenId: "t2", tokenName: "scanner" } as const;
const TOKEN = "f".repeat(64);

const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/stock-import/commit", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod" }),
  });

const workbook = async () =>
  (await writeXlsxFile([{ sheet: "Stock", data: [["Material ID", "Location ID", "Physical quantity", "Unit"], ["00000001", "00000001", 85, null]] }]).toBuffer()).toString("base64");

describe("POST /api/tenants/{tenant}/stock-import/commit", () => {
  afterEach(() => vi.clearAllMocks());

  it("commits the prepared rows with the dry run's token, the reason and the caller", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { stockImportService: { commit: mocks.commit } };
    mocks.commit.mockResolvedValue({ committed: true });

    const response = await post({ workbook: await workbook(), previewToken: TOKEN, reason: " Stock count " });

    expect(await response.json()).toEqual({ ok: true, data: { committed: true } });
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({ hasStockSheet: true }),
      TOKEN,
      "Stock count",
      expect.objectContaining({ username: "bob", channel: "api" }),
    );
  });

  it("needs the dry run's token and a reason before reading anything", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ workbook: await workbook() });

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toEqual({ previewToken: [PREVIEW_TOKEN_MESSAGE], reason: [STOCK_REASON_MESSAGE] });
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
