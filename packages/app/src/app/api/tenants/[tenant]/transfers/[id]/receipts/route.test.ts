import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const USER_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "erp" } as const;
const API_ACTOR = { userId: "u2", username: "alice", sessionId: null, channel: "api", token: { id: "t2", name: "erp" } };

const mocks = vi.hoisted(() => ({ receive: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/transfers/00000004/receipts", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant: "prod", id: "00000004" }),
  });

describe("/api/tenants/{tenant}/transfers/{id}/receipts", () => {
  afterEach(() => vi.clearAllMocks());

  it("POST posts the parsed quantity on the path's transfer as the token, ignoring a client date (INV-010)", async () => {
    mocks.state.caller = USER_TOKEN;
    mocks.state.cradle = { transferService: { receive: mocks.receive } };
    mocks.receive.mockResolvedValue({ transfer: { id: "00000004" }, posting: { kind: "x" } });

    const response = await post({ quantity: "60.0", unit: "kg", businessDate: "2020-01-01" });

    expect(await response.json()).toEqual({ ok: true, data: { transfer: { id: "00000004" }, posting: { kind: "x" } } });
    expect(mocks.receive).toHaveBeenCalledWith("00000004", { quantity: "60", unit: "kg" }, API_ACTOR);
  });

  it("POST refuses a missing or nonpositive quantity, posting nothing", async () => {
    mocks.state.caller = USER_TOKEN;

    const response = await post({ quantity: "0", unit: "" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["quantity", "unit"]);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
});
