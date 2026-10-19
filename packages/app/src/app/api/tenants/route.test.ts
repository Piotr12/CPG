import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ list: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  apiHandler: (await importOriginal<typeof import("@cpg/core")>()).apiHandler,
  requestScope: async () => ({ cradle: { tenantService: { list: mocks.list } } }),
}));
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const TENANTS = [
  { code: "test", name: "Test", generation: 1 },
  { code: "prod", name: "Prod", generation: 1 },
];

describe("GET /api/tenants", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue(TENANTS);
  });
  afterEach(() => vi.clearAllMocks());

  it("lists both tenants' metadata for a signed-in account (API-034)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "admin" });

    const request = new Request("http://cpg.test/api/tenants");
    const response = await GET(request, undefined);

    expect(mocks.requireApiUser).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: TENANTS });
  });

  it("refuses a caller without a session, before reading anything", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request("http://cpg.test/api/tenants"), undefined);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
