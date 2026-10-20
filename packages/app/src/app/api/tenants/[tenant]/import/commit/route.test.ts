import writeXlsxFile from "write-excel-file/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_TOKEN_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const TOKEN = "f".repeat(64);

const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/import/commit", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod" }),
  });

const workbook = async () =>
  (await writeXlsxFile([{ sheet: "Locations", data: [["ID", "Name", "Active"], [null, "Cave", null]] }]).toBuffer()).toString("base64");

describe("POST /api/tenants/{tenant}/import/commit", () => {
  afterEach(() => vi.clearAllMocks());

  it("commits the prepared rows with the dry run's token", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { importService: { commit: mocks.commit } };
    mocks.commit.mockResolvedValue({ committed: true });

    const response = await post({ workbook: await workbook(), previewToken: TOKEN });

    expect(await response.json()).toEqual({ ok: true, data: { committed: true } });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ sheets: ["locations"] }), TOKEN, expect.objectContaining({ channel: "api" }));
  });

  it("needs the dry run's token", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const response = await post({ workbook: await workbook() });

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toEqual({ previewToken: [PREVIEW_TOKEN_MESSAGE] });
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("forbids a normal user's token", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post({ workbook: await workbook(), previewToken: TOKEN })).status).toBe(403);
  });
});
