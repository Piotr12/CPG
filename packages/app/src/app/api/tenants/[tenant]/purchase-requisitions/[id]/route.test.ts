import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setRequiredDate: vi.fn(),
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
  route.PATCH(new Request(`http://cpg.test/api/tenants/prod/purchase-requisitions/${id}`, { method: "PATCH", body: JSON.stringify(body) }), context(id));

describe("/api/tenants/{tenant}/purchase-requisitions/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one requisition in the path's tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseRequisitionService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002" });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/purchase-requisitions/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002" } });
  });

  it("GET answers an ID the tenant doesn't have with 404 REQUISITION_NOT_FOUND", async () => {
    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { purchaseRequisitionService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(new NotFoundError("REQUISITION_NOT_FOUND", "There is no purchase requisition abc in this tenant."));

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/purchase-requisitions/abc"), context("abc"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("REQUISITION_NOT_FOUND");
  });

  it("PATCH sets the date at the version sent, as the token, for a normal user", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { purchaseRequisitionService: { setRequiredDate: mocks.setRequiredDate } };
    mocks.setRequiredDate.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, requiredDate: "2027-04-01" });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.setRequiredDate).toHaveBeenCalledWith("00000002", "2027-04-01", 2, API_ACTOR);
  });

  it("PATCH refuses a quantity in the body, a missing version and a bad date", async () => {
    mocks.state.caller = USER_TOKEN;

    const resized = await patch("00000002", { version: 1, requiredDate: "2027-04-01", quantity: "5" });
    const unversioned = await patch("00000002", { requiredDate: "2027-04-01" });
    const undated = await patch("00000002", { version: 1, requiredDate: "tomorrow" });

    expect(resized.status).toBe(400);
    expect((await resized.json()).error.fieldErrors).toHaveProperty("quantity");
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect((await undated.json()).error.fieldErrors).toHaveProperty("requiredDate");
    expect(mocks.setRequiredDate).not.toHaveBeenCalled();
  });
});
