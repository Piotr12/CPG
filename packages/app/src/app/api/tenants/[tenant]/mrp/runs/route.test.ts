import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, UnauthorizedError } from "@cpg/core";
import { POST } from "./route";
import { GET } from "./latest/route";

const mocks = vi.hoisted(() => ({
  run: vi.fn(), latest: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn(), state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../auth/api-write", async () => (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state));

const context = { params: Promise.resolve({ tenant: "prod" }) };
const run = { id: "00000003", createdAt: "2026-10-27T06:00:00.000Z", account: "alice", channel: "api", mode: "manual", generation: 1,
  startDate: "2026-10-27", endDate: "2027-01-24", horizonDays: 90, pairs: 2 };
const post = (body?: string) => POST(new Request("http://cpg.test/api/tenants/prod/mrp/runs", { method: "POST", body }), context);
const get = (query = "") => GET(new Request(`http://cpg.test/api/tenants/prod/mrp/runs/latest${query}`), context);
afterEach(() => vi.clearAllMocks());

describe("MRP run API wiring", () => {
  it("runs MRP as the token's actor through the shared write cradle, with an empty body or {}", async () => {
    mocks.state.caller = { userId: "u1", username: "alice", role: "user", tokenId: "t1", tokenName: "planner" };
    mocks.state.cradle = { mrpRunService: { run: mocks.run } };
    mocks.run.mockResolvedValue(run);

    const result = await post();
    await post("{}");

    expect(await result.json()).toEqual({ ok: true, data: run });
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run).toHaveBeenCalledWith({ userId: "u1", username: "alice", sessionId: null, channel: "api", token: { id: "t1", name: "planner" } });
  });

  it("refuses a body with any field before running anything", async () => {
    mocks.state.cradle = { mrpRunService: { run: mocks.run } };

    const result = await post(JSON.stringify({ mode: "automatic" }));

    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("authenticates a latest-run read, then reads the query as sent through the tenant's service", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { mrpRunService: { latest: mocks.latest } } });
    mocks.latest.mockResolvedValue({ run, page: 2, pageSize: 25, total: 30, plans: [] });

    const result = await get("?page=2&run=00000003");

    expect(await result.json()).toEqual({ ok: true, data: { run, page: 2, pageSize: 25, total: 30, plans: [] } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.latest).toHaveBeenCalledWith({ page: "2", run: "00000003" });
  });

  it("refuses an unsigned read before touching the tenant, and passes on the service's refusals", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new UnauthorizedError());
    expect((await get()).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();

    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { mrpRunService: { latest: mocks.latest } } });
    mocks.latest.mockRejectedValueOnce(new NotFoundError("MRP_RUN_NOT_FOUND", "none"));
    expect(await (await get()).json()).toMatchObject({ ok: false, error: { code: "MRP_RUN_NOT_FOUND" } });
    mocks.latest.mockRejectedValueOnce(new ConflictError("superseded", "MRP_RUN_SUPERSEDED", { run: "00000001" }));
    const superseded = await get("?run=00000001");
    expect(superseded.status).toBe(409);
    expect(await superseded.json()).toMatchObject({ ok: false, error: { code: "MRP_RUN_SUPERSEDED", params: { run: "00000001" } } });
  });
});
