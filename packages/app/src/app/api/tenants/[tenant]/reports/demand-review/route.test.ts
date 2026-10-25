import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError, ValidationError } from "@cpg/core";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ read: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const context = { params: Promise.resolve({ tenant: "test" }) };
const url = (query = "") => new Request(`http://cpg.test/api/tenants/test/reports/demand-review${query}`);
afterEach(() => vi.clearAllMocks());

describe("demand review API wiring", () => {
  it("authenticates, then reads the query through the tenant's service, keeping repeated products and locations", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { demandReviewService: { read: mocks.read } } });
    mocks.read.mockResolvedValue({ unit: "SU", rows: [] });

    const result = await GET(url("?bucket=month&material=00000001&material=00000002&location=00000003&unit=SU&offset=-1"), context);

    expect(await result.json()).toEqual({ ok: true, data: { unit: "SU", rows: [] } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.read).toHaveBeenCalledWith({ bucket: "month", material: ["00000001", "00000002"], location: ["00000003"], unit: "SU", offset: "-1" });
  });

  it("leaves absent filters out", async () => {
    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { demandReviewService: { read: mocks.read } } });
    mocks.read.mockResolvedValue({});
    await GET(url(), context);
    expect(mocks.read).toHaveBeenCalledWith({});
  });

  it("refuses an unsigned read before touching the tenant, and passes on the service's refusals", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new UnauthorizedError());
    expect((await GET(url(), context)).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();

    mocks.requireApiUser.mockResolvedValue({ role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { demandReviewService: { read: mocks.read } } });
    mocks.read.mockRejectedValueOnce(new ValidationError({ offset: ["bad"] }));
    expect((await GET(url("?offset=99"), context)).status).toBe(400);
    mocks.read.mockRejectedValueOnce(new NotFoundError("MATERIAL_NOT_FOUND", "missing"));
    expect((await GET(url("?material=00000009"), context)).status).toBe(404);
  });
});
