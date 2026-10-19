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
  route.PATCH(
    new Request(`http://cpg.test/api/tenants/prod/materials/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    context(id),
  );

describe("/api/tenants/{tenant}/materials/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one material with its conversions in the path's tenant", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { materialService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002", conversions: [] });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/materials/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", conversions: [] } });
  });

  it("GET answers an ID the tenant doesn't have with 404 MATERIAL_NOT_FOUND", async () => {
    const { materialNotFound } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { materialService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(materialNotFound("abc"));

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/materials/abc"), context("abc"));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("MATERIAL_NOT_FOUND");
  });

  it("PATCH edits only the fields sent, at the version sent, as the token (API-029)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { materialService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, description: " New ", active: false });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.update).toHaveBeenCalledWith(
      "00000002",
      { description: "New", type: undefined, baseUnit: undefined, active: false },
      2,
      API_ACTOR,
    );
  });

  it("PATCH refuses an ID in the body (MAT-004) and a missing version", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const renamed = await patch("00000002", { version: 1, id: "00000009" });
    const unversioned = await patch("00000002", { description: "x" });

    expect(renamed.status).toBe(400);
    expect((await renamed.json()).error.fieldErrors).toEqual({ id: ["A material's ID can't be changed."] });
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PATCH forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await patch("00000002", { version: 1, active: false })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
