import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError, ValidationError } from "@cpg/core";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ read: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const context = { params: Promise.resolve({ tenant: "test" }) };
const url = (query = "") => new Request(`http://cpg.test/api/tenants/test/reports/variance${query}`);
afterEach(() => vi.clearAllMocks());

describe("variance report API wiring", () => {
  it("authenticates, then reads the query as sent through the tenant's report service", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { varianceReportService: { read: mocks.read } } });
    mocks.read.mockResolvedValue({ total: 0, rows: [] });

    const result = await GET(url("?material=00000001&status=open&from=2026-10-01&page=2"), context);

    expect(await result.json()).toEqual({ ok: true, data: { total: 0, rows: [] } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.read).toHaveBeenCalledWith({ material: "00000001", status: "open", from: "2026-10-01", page: "2" });
  });

  it("refuses an unsigned read before touching the tenant, and passes on the service's refusals", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new UnauthorizedError());
    expect((await GET(url(), context)).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();

    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { varianceReportService: { read: mocks.read } } });
    mocks.read.mockRejectedValueOnce(new ValidationError({ page: ["bad"] }));
    expect((await GET(url("?page=0"), context)).status).toBe(400);
    mocks.read.mockRejectedValueOnce(new NotFoundError("MATERIAL_NOT_FOUND", "missing"));
    expect((await GET(url("?material=00000009"), context)).status).toBe(404);
  });
});
