import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../auth/api-write", async () => (await import("../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const context = () => ({ params: Promise.resolve({ tenant: "test" }) });
const input = { customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "2", unit: "each", requiredDate: "2027-01-04" }] };
const normalized = { ...input, lines: [{ ...input.lines[0], quantity: "2.000000" }] };
const request = (body: unknown) => new Request("http://cpg.test/api/tenants/test/customer-orders", { method: "POST", body: JSON.stringify(body) });
describe("customer orders collection route", () => {
  afterEach(() => vi.clearAllMocks());
  it("reads through the selected tenant after authentication", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { customerOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue({ id: "00000001" });
    expect(await (await route.GET(new Request("http://cpg.test/api/tenants/test/customer-orders"), context())).json()).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test"); expect(mocks.list).toHaveBeenCalledWith({ page: 1 });
  });
  it("validates and forwards collection pages", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { customerOrderService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([]);
    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/customer-orders?page=2"), context())).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ page: 2 }); mocks.list.mockClear();
    for (const query of ["page=0", "surprise=1"])
      expect((await route.GET(new Request(`http://cpg.test/api/tenants/test/customer-orders?${query}`), context())).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("does not resolve a tenant for an unauthenticated read", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/customer-orders"), context())).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
  it.each(["admin", "user"])("forwards a parsed aggregate and token actor for role %s", async (role) => {
    mocks.state.caller = { userId: "u1", username: "writer", role, tokenId: "t1", tokenName: "client" };
    mocks.state.cradle = { customerOrderService: { create: mocks.create } }; mocks.create.mockResolvedValue({ id: "00000001" });
    expect(await (await route.POST(request(input), context())).json()).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.create).toHaveBeenCalledWith(normalized, expect.objectContaining({ channel: "api", token: { id: "t1", name: "client" } }));
  });
  it("returns dotted line validation errors before writing", async () => {
    const response = await route.POST(request({ ...input,  lines: [{ ...input.lines[0], quantity: 2 }] }), context());
    expect(response.status).toBe(400); expect((await response.json()).error.fieldErrors["lines.0.quantity"]).toHaveLength(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
