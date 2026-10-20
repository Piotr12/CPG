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
  route.PATCH(new Request(`http://cpg.test/api/tenants/prod/purchase-orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }), context(id));

describe("/api/tenants/{tenant}/purchase-orders/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one order with its lines in the path's tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002", lines: [] });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/purchase-orders/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", lines: [] } });
  });

  it("GET answers an ID the tenant doesn't have with 404 PURCHASE_ORDER_NOT_FOUND", async () => {
    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseOrderService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(new NotFoundError("PURCHASE_ORDER_NOT_FOUND", "There is no purchase order abc in this tenant."));

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/purchase-orders/abc"), context("abc"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("PURCHASE_ORDER_NOT_FOUND");
  });

  it("PATCH sets the dates of the named lines at the version sent, as the token, for a normal user", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { purchaseOrderService: { setPlannedDates: mocks.setPlannedDates } };
    mocks.setPlannedDates.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, lines: [{ line: 1, plannedDate: "2027-04-01" }] });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.setPlannedDates).toHaveBeenCalledWith("00000002", [{ line: 1, plannedDate: "2027-04-01" }], 2, API_ACTOR);
  });

  it("PATCH refuses a supplier in the body, a missing version and a bad line", async () => {
    mocks.state.caller = USER_TOKEN;
    const lines = [{ line: 1, plannedDate: "2027-04-01" }];

    const moved = await patch("00000002", { version: 1, lines, supplier: "00000009" });
    const unversioned = await patch("00000002", { lines });
    const unnumbered = await patch("00000002", { version: 1, lines: [{ line: 0, plannedDate: "2027-04-01" }] });

    expect(moved.status).toBe(400);
    expect((await moved.json()).error.fieldErrors).toHaveProperty("supplier");
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect((await unnumbered.json()).error.fieldErrors).toHaveProperty("lines.0.line");
    expect(mocks.setPlannedDates).not.toHaveBeenCalled();
  });
});
