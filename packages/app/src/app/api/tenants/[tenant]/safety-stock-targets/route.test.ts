import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };
const TARGET = { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01", quantity: "20" };

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
    new Request("http://cpg.test/api/tenants/prod/safety-stock-targets", { method: "POST", body: JSON.stringify(body) }),
    context("prod"),
  );

describe("/api/tenants/{tenant}/safety-stock-targets", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's targets for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { safetyStockTargetService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ effectiveFrom: "2027-01-01" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/safety-stock-targets"), context("prod"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(await response.json()).toEqual({ ok: true, data: [{ effectiveFrom: "2027-01-01" }] });
  });

  it("POST adds the parsed target, audited as the token (DEM-015)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { safetyStockTargetService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ effectiveFrom: "2027-01-01", version: 1 });

    const response = await post(TARGET);

    expect(await response.json()).toEqual({ ok: true, data: { effectiveFrom: "2027-01-01", version: 1 } });
    expect(mocks.create).toHaveBeenCalledWith({ ...TARGET, quantity: "20.000000" }, API_ACTOR);
  });

  it("POST refuses an impossible date, and a normal user's token (API-010)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    const response = await post({ ...TARGET, effectiveFrom: "2027-02-30" });
    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors)).toEqual(["effectiveFrom"]);

    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };
    expect((await post(TARGET)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("/api/tenants/{tenant}/safety-stock-targets search and sort (#221)", () => {
  const read = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/safety-stock-targets?${query}`), context("test"));

  afterEach(() => vi.clearAllMocks());

  it("GET forwards the search, sort and direction to the service, and leaves them out without a query (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { safetyStockTargetService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("q=+steel+&sort=effectiveFrom&dir=desc")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "steel", sort: "effectiveFrom", dir: "desc" });
    expect((await read("")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "" });
  });

  it("GET refuses an unknown sort, a bad direction or a too-long search on that field, before reading (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { safetyStockTargetService: { list: mocks.list } } });
    for (const query of ["sort=quantity", "dir=up", "q=a+b+c+d+e+f"]) {
      const response = await read(query);
      expect(response.status).toBe(400);
      expect(Object.keys((await response.json()).error.fieldErrors)).toEqual([query.split("=")[0]]);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("GET still ignores a query key it doesn't know (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { safetyStockTargetService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("status=open")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ q: "" });
  });
});
