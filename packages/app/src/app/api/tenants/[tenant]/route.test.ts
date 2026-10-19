import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ tenantScope: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  apiHandler: (await importOriginal<typeof import("@cpg/core")>()).apiHandler,
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const get = (tenant: string) =>
  GET(new Request(`http://cpg.test/api/tenants/${tenant}`), { params: Promise.resolve({ tenant }) });

describe("GET /api/tenants/{tenant}", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the tenant read through its own scope (API-013)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "admin" });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: { code: "prod", name: "Prod", generation: 1 } } });

    const response = await get("prod");

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(await response.json()).toEqual({ ok: true, data: { code: "prod", name: "Prod", generation: 1 } });
  });

  it("answers an unknown tenant with 404 TENANT_NOT_FOUND", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "admin" });
    mocks.tenantScope.mockRejectedValue((await core()).tenantNotFound());

    const response = await get("staging");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: { code: "TENANT_NOT_FOUND", message: "Unknown tenant." } });
  });

  it("checks the session before the tenant", async () => {
    mocks.requireApiUser.mockRejectedValue(new (await core()).UnauthorizedError());

    const response = await get("staging");

    expect(response.status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
});
