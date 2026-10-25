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

  it("GET forwards ?page= to the service, takes the first page without one, and refuses an invalid page", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);
    const get = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/purchase-orders${query}`), context("test"));

    await get("");
    await get("?page=2");
    expect(mocks.list.mock.calls).toEqual([[{ page: 1, q: "" }], [{ page: 2, q: "" }]]);

    mocks.list.mockClear();
    for (const bad of ["?page=0", "?page=x", "?page=1.5"]) expect((await get(bad)).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
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

describe("/api/tenants/{tenant}/purchase-orders search and sort (#221)", () => {
  const read = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/purchase-orders?${query}`), context("test"));

  afterEach(() => vi.clearAllMocks());

  it("GET forwards the search, sort and direction to the service, and leaves them out without a query (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("page=2&q=+steel+&sort=supplier&dir=desc")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, q: "steel", sort: "supplier", dir: "desc" });
    expect((await read("")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, q: "" });
  });

  it("GET refuses an unknown sort, a bad direction or a too-long search on that field, before reading (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { list: mocks.list } } });
    for (const query of ["sort=quantity", "dir=up", "q=a+b+c+d+e+f"]) {
      const response = await read(query);
      expect(response.status).toBe(400);
      expect(Object.keys((await response.json()).error.fieldErrors)).toEqual([query.split("=")[0]]);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("GET still ignores a query key it doesn't know (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("status=open")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, q: "" });
  });
});
