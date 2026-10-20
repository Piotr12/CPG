import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const context = (id: string) => ({ params: Promise.resolve({ tenant: "prod", id }) });
const patch = (id: string, body: unknown) =>
  route.PATCH(new Request(`http://cpg.test/api/tenants/prod/boms/${id}`, { method: "PATCH", body: JSON.stringify(body) }), context(id));

describe("/api/tenants/{tenant}/boms/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one BOM with its revisions in the path's tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { bomService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002", revisions: [] });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/boms/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", revisions: [] } });
  });

  it("GET answers an ID the tenant doesn't have with 404 BOM_NOT_FOUND", async () => {
    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { bomService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(new NotFoundError("BOM_NOT_FOUND", "There is no BOM abc in this tenant."));

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/boms/abc"), context("abc"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("BOM_NOT_FOUND");
  });

  it("PATCH passes only the fields sent, null to remove the end, at the version sent, as the token (API-029)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { bomService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, validThrough: null, active: false });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.update).toHaveBeenCalledWith(
      "00000002",
      { priority: undefined, validFrom: undefined, validThrough: null, components: undefined, active: false },
      2,
      API_ACTOR,
    );
  });

  it("PATCH refuses an output in the body, and a missing version", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const moved = await patch("00000002", { version: 1, output: "00000009" });
    const unversioned = await patch("00000002", { priority: 2 });

    expect(moved.status).toBe(400);
    expect((await moved.json()).error.fieldErrors).toMatchObject({ output: ["A BOM's output can't be changed: create a new BOM."] });
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PATCH forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await patch("00000002", { version: 1, active: false })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
