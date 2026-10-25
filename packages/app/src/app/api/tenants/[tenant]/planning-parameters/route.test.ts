import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };
const SET = { material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50", lotMultiple: "10" };

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
  route.POST(
    new Request("http://cpg.test/api/tenants/prod/planning-parameters", { method: "POST", body: JSON.stringify(body) }),
    context("prod"),
  );

describe("/api/tenants/{tenant}/planning-parameters", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's sets for any signed-in account, through that tenant's scope", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { planningParameterService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ material: "00000004" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/test/planning-parameters"), context("test"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(await response.json()).toEqual({ ok: true, data: [{ material: "00000004" }] });
  });

  it("GET checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/planning-parameters"), context("test"))).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST adds the parsed set, audited as the token (R07, MAT-016)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { planningParameterService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ material: "00000004", version: 1 });

    const response = await post({ ...SET, tenant: "test" });

    expect(await response.json()).toEqual({ ok: true, data: { material: "00000004", version: 1 } });
    expect(mocks.create).toHaveBeenCalledWith({ ...SET, minimumQuantity: "50.000000", lotMultiple: "10.000000" }, API_ACTOR);
  });

  it("POST refuses a lead time sent as text or a quantity sent as a number, adding nothing (R03, MAT-018)", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const response = await post({ ...SET, leadTimeDays: "2", lotMultiple: 10 });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["leadTimeDays", "lotMultiple"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("POST forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post(SET)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("/api/tenants/{tenant}/planning-parameters search and sort (#221)", () => {
  const read = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/planning-parameters?${query}`), context("test"));

  afterEach(() => vi.clearAllMocks());

  it("GET forwards the search, sort and direction to the service, and leaves them out without a query (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { planningParameterService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("q=+steel+&sort=leadTime&dir=desc")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "steel", sort: "leadTime", dir: "desc" });
    expect((await read("")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "" });
  });

  it("GET refuses an unknown sort, a bad direction or a too-long search on that field, before reading (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { planningParameterService: { list: mocks.list } } });
    for (const query of ["sort=quantity", "dir=up", "q=a+b+c+d+e+f"]) {
      const response = await read(query);
      expect(response.status).toBe(400);
      expect(Object.keys((await response.json()).error.fieldErrors)).toEqual([query.split("=")[0]]);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("GET still ignores a query key it doesn't know (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { planningParameterService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("status=open")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "" });
  });
});
