import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  post: vi.fn(),
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const context = (tenant: string) => ({ params: Promise.resolve({ tenant }) });
const get = (query = "") => route.GET(new Request(`http://cpg.test/api/tenants/test/goods-receipts${query}`), context("test"));
const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/goods-receipts", { method: "POST", body: JSON.stringify(body) }), context("prod"));

describe("/api/tenants/{tenant}/goods-receipts", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's receipts, or one order's, for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { goodsReceiptService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    expect(await (await get()).json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
    expect(mocks.list).toHaveBeenLastCalledWith({});
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");

    await get("?purchaseOrder=00000004");
    expect(mocks.list).toHaveBeenLastCalledWith({ purchaseOrder: "00000004" });
  });

  it("GET refuses a malformed order filter, and checks the caller before opening the tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { goodsReceiptService: { list: mocks.list } } });
    expect((await get("?purchaseOrder=4")).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.tenantScope.mockClear();
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
    expect((await get()).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST posts the parsed receipt as the token's account, dropping fields a receipt doesn't take (R07, INV-010)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { goodsReceiptService: { post: mocks.post } };
    mocks.post.mockResolvedValue({ id: "00000002", warnings: [] });

    const response = await post({ purchaseOrder: "00000001", businessDate: "2020-01-01", lines: [{ line: 1, quantity: "30.0", unit: "kg" }] });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", warnings: [] } });
    expect(mocks.post).toHaveBeenCalledWith({ purchaseOrder: "00000001", lines: [{ line: 1, quantity: "30", unit: "kg" }] }, API_ACTOR);
  });

  it("POST names the invalid fields, by line, and posts nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ purchaseOrder: "x", lines: [{ line: 0, quantity: 30, unit: "kg" }] });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["lines.0.line", "lines.0.quantity", "purchaseOrder"]);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
