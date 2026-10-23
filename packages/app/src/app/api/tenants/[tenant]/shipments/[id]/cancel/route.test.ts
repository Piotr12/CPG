import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
afterEach(() => vi.clearAllMocks());
const post = (body: unknown) => POST(new Request("http://cpg.test/api/tenants/prod/shipments/00000004/cancel", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ tenant: "prod", id: "00000004" }) });

it.each(["user", "admin"])("cancels the path's shipment as a %s API caller at its supplied version", async (role) => {
  mocks.state.caller = { userId: "u", username: "alice", role, tokenId: "token", tokenName: "ERP" };
  mocks.state.cradle = { shipmentService: { cancel: mocks.cancel } };
  mocks.cancel.mockResolvedValue({ id: "00000004", status: "cancelled" });
  const response = await post({ version: 3 });
  expect(response.status).toBe(200);
  expect((await response.json()).data.status).toBe("cancelled");
  expect(mocks.cancel).toHaveBeenCalledWith("00000004", 3, { userId: "u", username: "alice", sessionId: null, channel: "api", token: { id: "token", name: "ERP" } });
});

it("refuses a missing version and any other field without calling the service", async () => {
  for (const body of [{}, { version: 1, status: "cancelled" }, { version: 1, lines: [1] }]) expect((await post(body)).status).toBe(400);
  expect(mocks.cancel).not.toHaveBeenCalled();
});
