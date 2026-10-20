import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

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
const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/purchase-orders", { method: "POST", body: JSON.stringify(body) }), context("prod"));
const LINE = { material: "00000001", quantity: "20.0", unit: "kg", plannedDate: "2027-03-03" };
const BODY = { supplier: "00000001", location: "00000002", lines: [LINE] };

describe("/api/tenants/{tenant}/purchase-orders", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's orders for any signed-in account, through that tenant's scope", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/test/purchase-orders"), context("test"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(await response.json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
  });

  it("GET checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/purchase-orders"), context("test"))).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates from the parsed body for a normal user's token, with no requisition when none is named (R07)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { purchaseOrderService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000003" });

    const response = await post(BODY);

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000003" } });
    expect(mocks.create).toHaveBeenCalledWith(
      { supplier: "00000001", location: "00000002", lines: [{ ...LINE, quantity: "20", requisition: null }] },
      API_ACTOR,
    );
  });

  it("POST names the invalid fields, by line, and creates nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ supplier: "x", location: "00000002", lines: [{ ...LINE, quantity: 20, plannedDate: "soon" }] });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["lines.0.plannedDate", "lines.0.quantity", "supplier"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
