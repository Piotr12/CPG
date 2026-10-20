import writeXlsxFile from "write-excel-file/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKBOOK_UNREADABLE_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };

const mocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/import/dry-run", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod" }),
  });

const workbook = async () =>
  (await writeXlsxFile([{ sheet: "Locations", data: [["ID", "Name", "Active"], [null, "Cave", null]] }]).toBuffer()).toString("base64");

describe("POST /api/tenants/{tenant}/import/dry-run", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the workbook and dry-runs its prepared rows, audited as the token", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { importService: { dryRun: mocks.dryRun } };
    mocks.dryRun.mockResolvedValue({ committed: false, previewToken: "t" });

    const response = await post({ workbook: await workbook() });

    expect(await response.json()).toEqual({ ok: true, data: { committed: false, previewToken: "t" } });
    const [prepared, actor] = mocks.dryRun.mock.calls[0];
    expect(prepared.locations).toEqual([{ row: 2, values: { id: null, name: "Cave", active: null } }]);
    expect(actor).toEqual(API_ACTOR);
  });

  it("refuses a missing or unreadable workbook before any row runs", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const missing = await post({});
    expect(missing.status).toBe(400);
    const unreadable = await post({ workbook: Buffer.from("not a zip").toString("base64") });
    expect((await unreadable.json()).error.fieldErrors).toEqual({ workbook: [WORKBOOK_UNREADABLE_MESSAGE] });
    expect(mocks.dryRun).not.toHaveBeenCalled();
  });

  it("forbids a normal user's token", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post({ workbook: await workbook() })).status).toBe(403);
    expect(mocks.dryRun).not.toHaveBeenCalled();
  });
});
