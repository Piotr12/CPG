import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));

const context = (tenant: string, id: string) => ({ params: Promise.resolve({ tenant, id }) });
const get = () => route.GET(new Request("http://cpg.test/api/tenants/test/shipments/00000002"), context("test", "00000002"));

describe("/api/tenants/{tenant}/shipments/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one shipment through the tenant's scope, for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { shipmentService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002" });

    expect(await (await get()).json()).toEqual({ ok: true, data: { id: "00000002" } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
  });

  it("GET answers 404 for a shipment this tenant doesn't have", async () => {
    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { shipmentService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(new NotFoundError("SHIPMENT_NOT_FOUND", "There is no shipment 00000002 in this tenant."));

    const response = await get();
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("SHIPMENT_NOT_FOUND");
  });

  const LINE = "b39a1861-4d27-4df5-8eee-d4c9879053d4";
  const patch = (body: unknown) =>
    route.PATCH(new Request("http://cpg.test/api/tenants/prod/shipments/00000004", { method: "PATCH", body: JSON.stringify(body) }), context("prod", "00000004"));

  it("PATCH replaces the path's shipment plan as an API caller, at its supplied version", async () => {
    mocks.state.caller = { userId: "u", username: "alice", role: "user", tokenId: "token", tokenName: "ERP" };
    mocks.state.cradle = { shipmentService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ id: "00000004", version: 4 });

    const response = await patch({ version: 3, plannedDate: "2026-11-02", lines: [{ orderLine: LINE, quantity: "20", unit: "each" }] });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ id: "00000004", version: 4 });
    expect(mocks.update).toHaveBeenCalledWith(
      "00000004",
      { plannedDate: "2026-11-02", lines: [{ orderLine: LINE, quantity: "20", unit: "each" }] },
      3,
      { userId: "u", username: "alice", sessionId: null, channel: "api", token: { id: "token", name: "ERP" } },
    );
  });

  it("PATCH refuses a missing version, another order and a set status without calling the service", async () => {
    mocks.state.cradle = { shipmentService: { update: mocks.update } };
    const plan = { plannedDate: "2026-11-02", lines: [{ orderLine: LINE, quantity: "20", unit: "each" }] };
    for (const body of [plan, { ...plan, version: 1, customerOrder: "00000002" }, { ...plan, version: 1, status: "cancelled" }]) expect((await patch(body)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
