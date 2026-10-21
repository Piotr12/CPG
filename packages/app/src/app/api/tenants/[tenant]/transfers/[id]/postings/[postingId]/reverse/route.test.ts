import { afterEach, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ reverse: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../../../auth/api-write", async () => (await import("../../../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
const posting = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ tenant: "prod", id: "00000004", postingId: posting }) };
const request = () => new Request("http://cpg.test/reverse", { method: "POST", body: JSON.stringify({ reason: "Wrong transfer" }) });
afterEach(() => vi.clearAllMocks());

it("passes the transfer, the posting and the strict body to the shared write cradle with the token actor", async () => {
  mocks.state.caller = { userId: "u", username: "Alice", role: "user", tokenId: "t", tokenName: "ops" };
  mocks.state.cradle = { transferService: { reverse: mocks.reverse } };
  mocks.reverse.mockResolvedValue({ transfer: { id: "00000004" }, reversal: { id: "r1" } });
  expect(await (await POST(request(), context)).json()).toMatchObject({ ok: true, data: { reversal: { id: "r1" } } });
  expect(mocks.reverse).toHaveBeenCalledWith("00000004", posting, { reason: "Wrong transfer" }, { userId: "u", username: "Alice", sessionId: null, channel: "api", token: { id: "t", name: "ops" } });
  mocks.reverse.mockRejectedValue(new ConflictError("Receipts first", "TRANSFER_REVERSAL_ORDER", { transfer: "00000004", received: "50.000000", writtenOff: "0.000000", unit: "kg" }));
  const refused = await POST(request(), context);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { code: "TRANSFER_REVERSAL_ORDER", params: { received: "50.000000" } } });
});
