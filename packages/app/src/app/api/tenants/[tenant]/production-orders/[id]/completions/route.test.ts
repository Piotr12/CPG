import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as collection from "./route";
import * as preview from "./preview/route";

const mocks = vi.hoisted(() => ({
  service: { list: vi.fn(), post: vi.fn(), preview: vi.fn() },
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../../auth/api-write", async () => (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));

const context = () => ({ params: Promise.resolve({ tenant: "test", id: "00000001" }) });
const body = { quantity: "40", unit: "each", components: [{ material: "00000002", quantity: "18.0", unit: "kg" }] };
const request = (value: unknown) => new Request("http://cpg.test/api/tenants/test/production-orders/00000001/completions", { method: "POST", body: JSON.stringify(value) });

beforeEach(() => {
  mocks.tenantScope.mockResolvedValue({ cradle: { productionCompletionService: mocks.service } });
  mocks.requireApiUser.mockResolvedValue({ role: "user" });
  mocks.state.caller = { userId: "u1", username: "writer", role: "user", tokenId: "t1", tokenName: "client" };
  mocks.state.cradle = { productionCompletionService: mocks.service };
});
afterEach(() => vi.clearAllMocks());

it("authenticates reads and parses the history page and the preview query", async () => {
  mocks.service.list.mockResolvedValue([]);
  mocks.service.preview.mockResolvedValue({ exceedsTarget: false });
  expect(await (await collection.GET(new Request("http://cpg.test/?page=2"), context())).json()).toEqual({ ok: true, data: [] });
  expect(mocks.service.list).toHaveBeenCalledWith("00000001", 2);
  expect(await (await preview.GET(new Request("http://cpg.test/?quantity=4.0&unit=each"), context())).json()).toEqual({ ok: true, data: { exceedsTarget: false } });
  expect(mocks.service.preview).toHaveBeenCalledWith("00000001", { quantity: "4", unit: "each" });
  expect(mocks.tenantScope).toHaveBeenCalledWith("test");
  expect((await collection.GET(new Request("http://cpg.test/?surprise=1"), context())).status).toBe(400);
  expect((await preview.GET(new Request("http://cpg.test/?quantity=4"), context())).status).toBe(400);
});

it("refuses unauthenticated reads before resolving a tenant", async () => {
  const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());
  for (const route of [collection, preview]) expect((await route.GET(new Request("http://cpg.test/"), context())).status).toBe(401);
  expect(mocks.tenantScope).not.toHaveBeenCalled();
});

it.each(["admin", "user"])("forwards a keyed completion with the API actor and no submission token for %s", async (role) => {
  mocks.state.caller = { userId: "u1", username: "writer", role, tokenId: "t1", tokenName: "client" };
  mocks.service.post.mockResolvedValue({ completion: { id: "00000001" } });
  const response = await collection.POST(request({ ...body, acceptOverproduction: true }), context());
  expect(await response.json()).toEqual({ ok: true, data: { completion: { id: "00000001" } } });
  expect(mocks.service.post).toHaveBeenCalledWith(
    "00000001",
    { quantity: "40", unit: "each", components: [{ material: "00000002", quantity: "18", unit: "kg" }], acceptOverproduction: true },
    expect.objectContaining({ channel: "api", token: { id: "t1", name: "client" } }),
  );
  expect(mocks.service.post.mock.calls[0]).toHaveLength(3);
});

it("refuses fields the server decides and malformed quantities before posting", async () => {
  for (const extra of [{ order: "00000002" }, { businessDate: "2026-01-01" }, { submission: "11111111-1111-4111-8111-111111111111" }, { quantity: 40 }]) {
    expect((await collection.POST(request({ ...body, ...extra }), context())).status).toBe(400);
  }
  expect((await collection.POST(request({ ...body, components: [{ ...body.components[0], variance: "-2" }] }), context())).status).toBe(400);
  expect(mocks.service.post).not.toHaveBeenCalled();
});

it("returns the service's refusal with its parameters", async () => {
  const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  mocks.service.post.mockRejectedValue(new ConflictError("short", "INSUFFICIENT_STOCK", { material: "00000002" }));
  const response = await collection.POST(request(body), context());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_STOCK", params: { material: "00000002" } } });
});
