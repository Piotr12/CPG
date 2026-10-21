import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ tenantScope: vi.fn(), listTenant: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return { createApiHandler: core.createApiHandler, parseInput: core.parseInput, tenantScope: mocks.tenantScope };
});
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const get = (tenant: string, query = "") =>
  GET(new Request(`http://cpg.test/api/tenants/${tenant}/audit${query}`), { params: Promise.resolve({ tenant }) });

describe("GET /api/tenants/{tenant}/audit", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the audit through that tenant's own scope (R05)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { auditService: { listTenant: mocks.listTenant } } });
    mocks.listTenant.mockResolvedValue({ entries: [], nextBefore: null });

    const response = await get("prod", "?limit=5");

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.listTenant).toHaveBeenCalledWith({ limit: 5 });
    expect(await response.json()).toEqual({ ok: true, data: { entries: [], nextBefore: null } });
  });

  it("passes the history filters to the tenant's service, parsed", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { auditService: { listTenant: mocks.listTenant } } });
    mocks.listTenant.mockResolvedValue({ entries: [], nextBefore: null });

    await get("test", "?subjectType=PurchaseOrder&subjectId=00000012&channel=ui&from=2026-10-21");

    expect(mocks.listTenant).toHaveBeenCalledWith({ limit: 50, subjectType: "PurchaseOrder", subjectId: "00000012", channel: "ui", from: "2026-10-21" });
  });

  it("answers a record ID without its type with 400 on subjectId", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { auditService: { listTenant: mocks.listTenant } } });

    const response = await get("test", "?subjectId=00000012");

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors)).toEqual(["subjectId"]);
    expect(mocks.listTenant).not.toHaveBeenCalled();
  });

  it("answers an unknown tenant with 404 TENANT_NOT_FOUND", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockRejectedValue((await core()).tenantNotFound());

    const response = await get("staging");

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("TENANT_NOT_FOUND");
  });

  it("answers a bad query with 400 VALIDATION_FAILED", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { auditService: { listTenant: mocks.listTenant } } });

    const response = await get("test", "?before=nope");

    expect(response.status).toBe(400);
    expect(mocks.listTenant).not.toHaveBeenCalled();
  });

  it("checks the session before the tenant", async () => {
    mocks.requireApiUser.mockRejectedValue(new (await core()).UnauthorizedError());

    const response = await get("test");

    expect(response.status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
});
