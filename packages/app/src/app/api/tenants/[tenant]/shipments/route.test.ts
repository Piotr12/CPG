import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const LINE = "7f0c8a8e-3b7b-4a52-9a39-1f2a0e6b2c11";
const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
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
const get = (query = "") => route.GET(new Request(`http://cpg.test/api/tenants/test/shipments${query}`), context("test"));
const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/shipments", { method: "POST", body: JSON.stringify(body) }), context("prod"));

describe("/api/tenants/{tenant}/shipments", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's shipments, or one order's, for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { shipmentService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    expect(await (await get()).json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1 });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");

    await get("?customerOrder=00000004");
    expect(mocks.list).toHaveBeenLastCalledWith({ customerOrder: "00000004", page: 1 });
    await get("?page=2");
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2 });
    await get("?customerOrder=00000004");
    expect(mocks.list).toHaveBeenLastCalledWith({ customerOrder: "00000004", page: 1 });
  });

  it("GET refuses a malformed order filter, and checks the caller before opening the tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { shipmentService: { list: mocks.list } } });
    expect((await get("?customerOrder=4")).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.tenantScope.mockClear();
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
    expect((await get()).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates the parsed shipment as the token's account (R07)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { shipmentService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000002" });

    const response = await post({ customerOrder: "00000001", plannedDate: "2026-11-03", lines: [{ orderLine: LINE, quantity: "30.0", unit: "kg" }] });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002" } });
    expect(mocks.create).toHaveBeenCalledWith({ customerOrder: "00000001", plannedDate: "2026-11-03", lines: [{ orderLine: LINE, quantity: "30", unit: "kg" }] }, API_ACTOR);
  });

  it("POST names the invalid fields, by line, and creates nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ customerOrder: "x", plannedDate: "2026-02-30", lines: [{ orderLine: "1", quantity: 30, unit: "kg" }] });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["customerOrder", "lines.0.orderLine", "lines.0.quantity", "plannedDate"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
