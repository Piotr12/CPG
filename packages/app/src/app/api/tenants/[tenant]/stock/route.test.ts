import { afterEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@cpg/core";
import { GET } from "./route";
import { POST } from "./corrections/route";
const mocks = vi.hoisted(() => ({ get: vi.fn(), correct: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../auth/api-write", async () => (await import("../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const context = { params: Promise.resolve({ tenant: "test" }) };
const line = { material: "00000001", location: "00000001", quantity: "-1", unit: "each", reason: "Count" };
afterEach(() => vi.clearAllMocks());
describe("stock API wiring", () => {
  it("authenticates GET and reads the validated pair through its tenant service", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { stockService: { get: mocks.get } } }); mocks.get.mockResolvedValue({ quantity: "0.000000" });
    const result = await GET(new Request("http://cpg.test/api/tenants/test/stock?material=00000001&location=00000001"), context);
    expect(await result.json()).toEqual({ ok: true, data: { quantity: "0.000000" } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test"); expect(mocks.get).toHaveBeenCalledWith({ material: line.material, location: line.location });
  });
  it("refuses unsigned reads and malformed queries", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new UnauthorizedError());
    expect((await GET(new Request("http://cpg.test/api/tenants/test/stock"), context)).status).toBe(401);
    mocks.requireApiUser.mockResolvedValue({ role: "user" }); mocks.tenantScope.mockResolvedValue({ cradle: { stockService: { get: mocks.get } } });
    expect((await GET(new Request("http://cpg.test/api/tenants/test/stock?material=bad"), context)).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("posts allowlisted fields as the token's actor through the shared write cradle", async () => {
    mocks.state.caller = { userId: "u1", username: "alice", role: "user", tokenId: "t1", tokenName: "ops" };
    mocks.state.cradle = { stockService: { correct: mocks.correct } }; mocks.correct.mockResolvedValue({ quantity: "-1.000000" });
    const result = await POST(new Request("http://cpg.test/api/tenants/test/stock/corrections", { method: "POST", body: JSON.stringify({ ...line, date: "1900-01-01" }) }), context);
    expect(await result.json()).toEqual({ ok: true, data: { quantity: "-1.000000" } });
    expect(mocks.correct).toHaveBeenCalledWith(line, { userId: "u1", username: "alice", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } });
    const invalid = await POST(new Request("http://cpg.test/api/tenants/test/stock/corrections", { method: "POST", body: JSON.stringify({ ...line, reason: " " }) }), context);
    expect(invalid.status).toBe(400);
  });
});
