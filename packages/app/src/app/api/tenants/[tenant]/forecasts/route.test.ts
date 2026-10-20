import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };
const FORECAST = { material: "00000005", location: "00000001", date: "2027-01-01", quantity: "20" };

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
    new Request("http://cpg.test/api/tenants/prod/forecasts", { method: "POST", body: JSON.stringify(body) }),
    context("prod"),
  );

describe("/api/tenants/{tenant}/forecasts", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's forecasts for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { forecastService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ date: "2027-01-01" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/forecasts"), context("prod"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.list).toHaveBeenCalledWith({});
    expect(await response.json()).toEqual({ ok: true, data: [{ date: "2027-01-01" }] });
  });

  it("GET narrows the list by the material and location query parameters", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { forecastService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    await route.GET(new Request("http://cpg.test/api/tenants/prod/forecasts?material=00000005&location=00000001"), context("prod"));
    await route.GET(new Request("http://cpg.test/api/tenants/prod/forecasts?location=00000001"), context("prod"));
    await route.GET(new Request("http://cpg.test/api/tenants/prod/forecasts?material="), context("prod"));

    expect(mocks.list.mock.calls).toEqual([[{ material: "00000005", location: "00000001" }], [{ location: "00000001" }], [{}]]);
  });

  it("GET refuses a filter that is not a business ID, listing nothing", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/forecasts?material=cabinet"), context("prod"));

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors)).toEqual(["material"]);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("POST adds the parsed forecast, audited as the token (DEM-001)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { forecastService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ date: "2027-01-01", version: 1 });

    const response = await post({ ...FORECAST, unit: "case" });

    expect(await response.json()).toEqual({ ok: true, data: { date: "2027-01-01", version: 1 } });
    expect(mocks.create).toHaveBeenCalledWith({ ...FORECAST, quantity: "20.000000", unit: "case" }, API_ACTOR);
  });

  it("POST refuses an impossible date, and a normal user's token (API-010)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    const response = await post({ ...FORECAST, date: "2027-02-30" });
    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors)).toEqual(["date"]);

    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };
    expect((await post(FORECAST)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
