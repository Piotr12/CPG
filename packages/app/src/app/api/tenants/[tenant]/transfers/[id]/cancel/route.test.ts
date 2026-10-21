import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
afterEach(() => vi.clearAllMocks());
const post = (body: unknown) => POST(new Request("http://cpg.test/api/tenants/prod/transfers/00000001/cancel", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ tenant: "prod", id: "00000001" }) });
it.each(["user", "admin"])("resolves the path's document as a %s API caller at its supplied version", async (role) => {
  mocks.state.caller = { userId: "u", username: "alice", role, tokenId: "token", tokenName: "ERP" };
  mocks.state.cradle = { transferService: { cancel: mocks.resolve } };
  mocks.resolve.mockResolvedValue({ id: "00000001", status: "cancelled" });
  const response = await post({ version: 3 });
  expect(response.status).toBe(200);
  expect((await response.json()).data.status).toBe("cancelled");
  expect(mocks.resolve).toHaveBeenCalledWith("00000001", 3, { userId: "u", username: "alice", sessionId: null, channel: "api", token: { id: "token", name: "ERP" } });
});
it("rejects a missing version and arbitrary state mutations without calling the service", async () => {
  for (const body of [{}, { version: 1, status: "completed" }]) expect((await post(body)).status).toBe(400);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
