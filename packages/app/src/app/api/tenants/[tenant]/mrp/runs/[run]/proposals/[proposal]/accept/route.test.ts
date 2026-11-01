import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ accept: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));
afterEach(() => vi.clearAllMocks());

const PROPOSAL = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const post = (body?: string) =>
  POST(new Request(`http://cpg.test/api/tenants/prod/mrp/runs/00000004/proposals/${PROPOSAL}/accept`, { method: "POST", body }), {
    params: Promise.resolve({ tenant: "prod", run: "00000004", proposal: PROPOSAL }),
  });

describe("MRP proposal acceptance API wiring", () => {
  it.each(["user", "admin"])("accepts the path's proposal of the path's run as a %s token's actor, with an empty body or {} (R07)", async (role) => {
    mocks.state.caller = { userId: "u1", username: "alice", role, tokenId: "t1", tokenName: "planner" };
    mocks.state.cradle = { mrpAcceptanceService: { accept: mocks.accept } };
    mocks.accept.mockResolvedValue({ proposal: { id: PROPOSAL, document: "00000012" }, document: { id: "00000012", mrpRun: "00000004" } });

    const response = await post();
    await post("{}");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { proposal: { id: PROPOSAL, document: "00000012" }, document: { id: "00000012", mrpRun: "00000004" } } });
    expect(mocks.accept).toHaveBeenCalledTimes(2);
    expect(mocks.accept).toHaveBeenCalledWith("00000004", PROPOSAL, { userId: "u1", username: "alice", sessionId: null, channel: "api", token: { id: "t1", name: "planner" } });
  });

  it("refuses a body with any field before accepting, and passes on the service's refusals with their params", async () => {
    mocks.state.cradle = { mrpAcceptanceService: { accept: mocks.accept } };
    expect((await post(JSON.stringify({ quantity: "5" }))).status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();

    mocks.accept.mockRejectedValueOnce(new ConflictError("stale", "MRP_PROPOSAL_STALE", { material: "00000031", location: "00000002" }));
    const refused = await post();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ ok: false, error: { code: "MRP_PROPOSAL_STALE", params: { material: "00000031", location: "00000002" } } });
  });
});
