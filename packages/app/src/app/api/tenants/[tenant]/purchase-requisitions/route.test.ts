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
  route.POST(new Request("http://cpg.test/api/tenants/prod/purchase-requisitions", { method: "POST", body: JSON.stringify(body) }), context("prod"));
const BODY = { material: "00000001", location: "00000002", quantity: "100.0", unit: "kg", requiredDate: "2027-03-01" };

describe("/api/tenants/{tenant}/purchase-requisitions", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's requisitions for any signed-in account, through that tenant's scope", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseRequisitionService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/test/purchase-requisitions"), context("test"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(await response.json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
  });

  it("GET forwards ?page= to the service, takes the first page without one, and refuses an invalid page (#187)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseRequisitionService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);
    const get = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/purchase-requisitions${query}`), context("test"));

    await get("");
    await get("?page=2");
    expect(mocks.list.mock.calls).toEqual([[1], [2]]);

    mocks.list.mockClear();
    for (const bad of ["?page=0", "?page=x", "?page=1.5"]) expect((await get(bad)).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("GET checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/purchase-requisitions"), context("test"))).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates from the parsed body for a normal user's token, audited as the token (R07)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { purchaseRequisitionService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000003" });

    const response = await post(BODY);

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000003" } });
    expect(mocks.create).toHaveBeenCalledWith({ ...BODY, quantity: "100" }, API_ACTOR);
  });

  it("POST names the invalid fields and creates nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ ...BODY, material: "x", quantity: 5, requiredDate: "2027-02-30" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["material", "quantity", "requiredDate"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
