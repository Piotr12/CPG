import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setPlannedDates: vi.fn(),
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const context = (id: string) => ({ params: Promise.resolve({ tenant: "prod", id }) });
const patch = (id: string, body: unknown) =>
  route.PATCH(new Request(`http://cpg.test/api/tenants/prod/transfers/${id}`, { method: "PATCH", body: JSON.stringify(body) }), context(id));

describe("/api/tenants/{tenant}/transfers/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one transfer with its postings in the path's tenant, and 404s an ID the tenant doesn't have", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { transferService: { get: mocks.get } } });
    mocks.get.mockResolvedValueOnce({ id: "00000002", postings: [] });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/transfers/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", postings: [] } });

    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.get.mockRejectedValueOnce(new NotFoundError("TRANSFER_NOT_FOUND", "There is no transfer 00000009 in this tenant."));
    const missing = await route.GET(new Request("http://cpg.test/api/tenants/prod/transfers/00000009"), context("00000009"));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("TRANSFER_NOT_FOUND");
  });

  it("PATCH sets both planned dates at the version sent, as the token", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { transferService: { setPlannedDates: mocks.setPlannedDates } };
    mocks.setPlannedDates.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, plannedDispatch: "2027-04-01", plannedArrival: "2027-04-03" });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.setPlannedDates).toHaveBeenCalledWith("00000002", { plannedDispatch: "2027-04-01", plannedArrival: "2027-04-03" }, 2, API_ACTOR);
  });

  it("PATCH refuses a quantity or a location in the body, a missing version and an arrival before dispatch", async () => {
    mocks.state.caller = USER_TOKEN;
    const dates = { plannedDispatch: "2027-04-01", plannedArrival: "2027-04-03" };

    const moved = await patch("00000002", { version: 1, ...dates, quantity: "5", destination: "00000003" });
    const unversioned = await patch("00000002", dates);
    const backwards = await patch("00000002", { version: 1, plannedDispatch: "2027-04-03", plannedArrival: "2027-04-01" });

    expect(moved.status).toBe(400);
    expect(Object.keys((await moved.json()).error.fieldErrors).sort()).toEqual(["destination", "quantity"]);
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect((await backwards.json()).error.fieldErrors).toHaveProperty("plannedArrival");
    expect(mocks.setPlannedDates).not.toHaveBeenCalled();
  });
});
