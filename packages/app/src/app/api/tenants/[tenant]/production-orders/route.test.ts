import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { productionInput as input } from "../../../../../../../../tests/setup/production-orders";
import * as collection from "./route";
import * as item from "./[id]/route";
import * as options from "./options/route";
const mocks = vi.hoisted(() => ({ service: { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), options: vi.fn() }, tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../auth/api-write", async () => (await import("../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const context = () => ({ params: Promise.resolve({ tenant: "test", id: "00000001" }) });
const request = (body: unknown) => new Request("http://cpg.test/api/tenants/test/production-orders", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  mocks.tenantScope.mockResolvedValue({ cradle: { productionOrderService: mocks.service } }); mocks.requireApiUser.mockResolvedValue({ role: "user" });
  mocks.state.caller = { userId: "u1", username: "writer", role: "user", tokenId: "t1", tokenName: "client" };
  mocks.state.cradle = { productionOrderService: mocks.service };
});
afterEach(() => vi.clearAllMocks());
it("authenticates reads and parses bounded collection pages and options", async () => {
  mocks.service.list.mockResolvedValue([]); mocks.service.get.mockResolvedValue({ id: "00000001" }); mocks.service.options.mockResolvedValue({ selected: "bom" });
  expect((await collection.GET(new Request("http://cpg.test/?page=2"), context())).status).toBe(200);
  expect(mocks.service.list).toHaveBeenCalledWith({ page: 2 });
  expect(await (await item.GET(new Request("http://cpg.test/"), context())).json()).toEqual({ ok: true, data: { id: "00000001" } });
  expect(mocks.service.get).toHaveBeenCalledWith("00000001");
  expect((await options.GET(new Request(`http://cpg.test/?${new URLSearchParams(input)}`), context())).status).toBe(200);
  expect(mocks.service.options).toHaveBeenCalledWith({ ...input, quantity: "2.000000" });
  expect(mocks.tenantScope).toHaveBeenCalledWith("test");
  expect((await collection.GET(new Request("http://cpg.test/?surprise=1"), context())).status).toBe(400);
  expect((await options.GET(new Request("http://cpg.test/"), context())).status).toBe(400);
});
it("refuses unauthenticated reads before resolving a tenant", async () => {
  const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
  for (const route of [collection, item, options]) expect((await route.GET(new Request("http://cpg.test/"), context())).status).toBe(401);
  expect(mocks.tenantScope).not.toHaveBeenCalled();
});
it.each(["admin", "user"])("forwards keyed creates and versioned edits through the supplied cradle for %s", async (role) => {
  mocks.state.caller = { userId: "u1", username: "writer", role, tokenId: "t1", tokenName: "client" };
  mocks.service.create.mockResolvedValue({ id: "00000001" }); mocks.service.update.mockResolvedValue({ version: 2 });
  expect((await collection.POST(request(input), context())).status).toBe(200);
  expect(mocks.service.create).toHaveBeenCalledWith({ ...input, quantity: "2.000000" }, expect.objectContaining({ channel: "api", token: { id: "t1", name: "client" } }));
  expect((await item.PATCH(request({ quantity: "3", version: 1 }), context())).status).toBe(200);
  expect(mocks.service.update).toHaveBeenCalledWith("00000001", { quantity: "3.000000" }, 1, expect.objectContaining({ channel: "api" }));
});
it("refuses malformed creates and every locked edit field before writes", async () => {
  expect((await collection.POST(request({ ...input, quantity: 2 }), context())).status).toBe(400);
  for (const field of ["output", "location", "bom", "revision", "plannedStart", "status", "produced", "id"]) {
    expect((await item.PATCH(request({ version: 1, [field]: "changed" }), context())).status).toBe(400);
  }
  expect(mocks.service.create).not.toHaveBeenCalled(); expect(mocks.service.update).not.toHaveBeenCalled();
});
