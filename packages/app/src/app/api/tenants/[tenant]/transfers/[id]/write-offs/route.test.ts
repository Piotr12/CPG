import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({ writeOff: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/transfers/00000004/write-offs", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod", id: "00000004" }),
  });

describe("/api/tenants/{tenant}/transfers/{id}/write-offs", () => {
  afterEach(() => vi.clearAllMocks());

  it("POST writes off the parsed quantity with its reason on the path's transfer, as the token (TRF-013)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { transferService: { writeOff: mocks.writeOff } };
    mocks.writeOff.mockResolvedValue({ transfer: { id: "00000004" }, posting: { kind: "write-off" } });

    const response = await post({ quantity: "10", unit: "kg", reason: " Lost on the road " });

    expect((await response.json()).ok).toBe(true);
    expect(mocks.writeOff).toHaveBeenCalledWith("00000004", { quantity: "10", unit: "kg", reason: "Lost on the road" }, API_ACTOR);
  });

  it("POST refuses a write-off without a reason, posting nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ quantity: "10", unit: "kg" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors)).toEqual(["reason"]);
    expect(mocks.writeOff).not.toHaveBeenCalled();
  });
});
