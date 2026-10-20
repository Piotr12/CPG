import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), tenantScope: vi.fn(), requestScope: vi.fn() }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope, requestScope: mocks.requestScope }));
afterEach(() => vi.clearAllMocks());

it("validates the body and forwards the validated generation and bearer audit actor to the service", async () => {
  const caller = { userId: "admin", username: "admin", role: "admin", tokenId: "token-id", tokenName: "ops" };
  mocks.requestScope.mockResolvedValue({ cradle: { apiTokenService: { authenticate: async () => caller } } });
  mocks.tenantScope.mockResolvedValue({ cradle: {
    testResetService: { reset: mocks.reset },
    idempotencyService: { run: async (_request: unknown, _scope: unknown, write: () => Promise<unknown>) => ({ data: await write(), replayed: false }) },
  } });
  mocks.reset.mockResolvedValue({ code: "test", generation: 4, readOnly: true });
  const request = (body: unknown) => new Request("http://cpg.test/api/tenants/test/reset", { method: "POST", headers: { Authorization: "Bearer dummy-test-secret", "Idempotency-Key": "k", "Dataset-Generation": "3" }, body: JSON.stringify(body) });
  expect(await (await POST(request({}), {})).json()).toEqual({ ok: true, data: { code: "test", generation: 4, readOnly: true } });
  expect(mocks.reset).toHaveBeenCalledWith(3, { userId: "admin", username: "admin", sessionId: null, channel: "api", token: { id: "token-id", name: "ops" } });
  mocks.reset.mockClear();
  expect((await POST(request({ tenant: "prod" }), {})).status).toBe(400);
  expect(mocks.reset).not.toHaveBeenCalled();
});
