import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({
  getRevision: vi.fn(),
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const get = (revision: string) =>
  route.GET(new Request(`http://cpg.test/api/tenants/prod/boms/00000002/revisions/${revision}`), {
    params: Promise.resolve({ tenant: "prod", id: "00000002", revision }),
  });

describe("/api/tenants/{tenant}/boms/{id}/revisions/{revision}", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads one revision of the BOM in the path's tenant (BOM-020)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { bomService: { getRevision: mocks.getRevision } } });
    mocks.getRevision.mockResolvedValue({ bom: "00000002", number: 1, current: false });

    const response = await get("1");

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.getRevision).toHaveBeenCalledWith("00000002", 1);
    expect(await response.json()).toEqual({ ok: true, data: { bom: "00000002", number: 1, current: false } });
  });

  it.each(["0", "01", "-1", "1.5", "abc"])("answers revision %s with 404 BOM_REVISION_NOT_FOUND", async (revision) => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { bomService: { getRevision: mocks.getRevision } } });

    const response = await get(revision);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatchObject({ code: "BOM_REVISION_NOT_FOUND" });
    expect(mocks.getRevision).not.toHaveBeenCalled();
  });

  it("checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await get("1")).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
});
