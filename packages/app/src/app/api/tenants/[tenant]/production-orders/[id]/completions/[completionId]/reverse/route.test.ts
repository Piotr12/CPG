import { afterEach, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ reverse: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../../../auth/api-write", async () => (await import("../../../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const context = { params: Promise.resolve({ tenant: "test", id: "00000001", completionId: "00000002" }) };
const request = () => new Request("http://cpg.test/reverse", { method: "POST", body: JSON.stringify({ reason: "Entered twice" }) });
afterEach(() => vi.clearAllMocks());

it("passes the order, the completion and the strict body to the shared write cradle with the token actor", async () => {
  mocks.state.caller = { userId: "u", username: "Alice", role: "user", tokenId: "t", tokenName: "ops" };
  mocks.state.cradle = { productionCompletionService: { reverse: mocks.reverse } };
  mocks.reverse.mockResolvedValue({ completion: { id: "00000002" }, order: { id: "00000001" }, movements: [] });
  expect(await (await POST(request(), context)).json()).toMatchObject({ ok: true, data: { completion: { id: "00000002" } } });
  expect(mocks.reverse).toHaveBeenCalledWith("00000001", "00000002", { reason: "Entered twice" }, { userId: "u", username: "Alice", sessionId: null, channel: "api", token: { id: "t", name: "ops" } });
  mocks.reverse.mockRejectedValue(new ConflictError("Already reversed", "PRODUCTION_COMPLETION_ALREADY_REVERSED", { reversal: "posting" }));
  const refused = await POST(request(), context);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", params: { reversal: "posting" } } });
});
