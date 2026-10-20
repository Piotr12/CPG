import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../auth/api-write", async () => (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const context = () => ({ params: Promise.resolve({ tenant: "test", id: "00000001" }) });
const input = { customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "2", unit: "each", requiredDate: "2027-01-04" }] };
const normalized = { ...input, lines: [{ ...input.lines[0], quantity: "2.000000" }] };
const request = (body: unknown) => new Request("http://cpg.test/api/tenants/test/customer-orders/00000001", { method: "PATCH", body: JSON.stringify(body) });
describe("customer orders item route", () => {
  afterEach(() => vi.clearAllMocks());
  it("reads through the selected tenant after authentication", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { customerOrderService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000001" });
    expect(await (await route.GET(new Request("http://cpg.test/api/tenants/test/customer-orders/00000001"), context())).json()).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test"); expect(mocks.get).toHaveBeenCalledWith("00000001");
  });
  it("does not resolve a tenant for an unauthenticated read", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/customer-orders/00000001"), context())).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
  it.each(["admin", "user"])("forwards a parsed aggregate and token actor for role %s", async (role) => {
    mocks.state.caller = { userId: "u1", username: "writer", role, tokenId: "t1", tokenName: "client" };
    mocks.state.cradle = { customerOrderService: { update: mocks.update } }; mocks.update.mockResolvedValue({ id: "00000001" });
    expect(await (await route.PATCH(request({ ...input, version: 3 }), context())).json()).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.update).toHaveBeenCalledWith("00000001", normalized, 3, expect.objectContaining({ channel: "api", token: { id: "t1", name: "client" } }));
  });
  it("returns dotted line validation errors before writing", async () => {
    const response = await route.PATCH(request({ ...input, version: 1, lines: [{ ...input.lines[0], quantity: 2 }] }), context());
    expect(response.status).toBe(400); expect((await response.json()).error.fieldErrors["lines.0.quantity"]).toHaveLength(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
