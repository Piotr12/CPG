import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };
const TRANSFER = { material: "00000001", source: "00000001", destination: "00000002", quantity: "100.0", unit: "kg", plannedDispatch: "2026-10-21", plannedArrival: "2026-10-23" };

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
const get = (query = "") => route.GET(new Request(`http://cpg.test/api/tenants/test/transfers${query}`), context("test"));
const post = (body: unknown) => route.POST(new Request("http://cpg.test/api/tenants/prod/transfers", { method: "POST", body: JSON.stringify(body) }), context("prod"));

describe("/api/tenants/{tenant}/transfers", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists a page of the tenant's transfers for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    expect(await (await get()).json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, q: "" });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    await get("?page=2");
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, q: "" });
  });

  it("GET refuses an unknown filter or page, and checks the caller before opening the tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { list: mocks.list } } });
    expect((await get("?page=0")).status).toBe(400);
    expect((await get("?status=open")).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.tenantScope.mockClear();
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
    expect((await get()).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates the parsed transfer as the token's account, dropping fields a transfer doesn't take", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { transferService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000001", status: "open" });

    const response = await post({ ...TRANSFER, status: "completed", dispatched: "100" });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000001", status: "open" } });
    expect(mocks.create).toHaveBeenCalledWith({ ...TRANSFER, quantity: "100" }, API_ACTOR);
  });

  it("POST refuses the same location twice, an arrival before dispatch and a second material, creating nothing (TRF-002, TRF-026)", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ ...TRANSFER, destination: "00000001", plannedArrival: "2026-10-20", materials: ["00000002"] });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["materials"]);
    const same = await post({ ...TRANSFER, destination: "00000001", plannedArrival: "2026-10-20" });
    expect(Object.keys((await same.json()).error.fieldErrors).sort()).toEqual(["destination", "plannedArrival"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("/api/tenants/{tenant}/transfers search and sort (#221)", () => {
  const read = (query: string) => route.GET(new Request(`http://cpg.test/api/tenants/test/transfers?${query}`), context("test"));

  afterEach(() => vi.clearAllMocks());

  it("GET forwards the search, sort and direction to the service, and leaves them out without a query (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);

    expect((await read("page=2&q=+steel+&sort=plannedDispatch&dir=desc")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, q: "steel", sort: "plannedDispatch", dir: "desc" });
    expect((await read("")).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ page: 1, q: "" });
  });

  it("GET refuses an unknown sort, a bad direction or a too-long search on that field, before reading (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { list: mocks.list } } });
    for (const query of ["sort=quantity", "dir=up", "q=a+b+c+d+e+f"]) {
      const response = await read(query);
      expect(response.status).toBe(400);
      expect(Object.keys((await response.json()).error.fieldErrors)).toEqual([query.split("=")[0]]);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("GET still refuses a query key it doesn't know (#221)", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { list: mocks.list } } });
    expect((await read("status=open")).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
