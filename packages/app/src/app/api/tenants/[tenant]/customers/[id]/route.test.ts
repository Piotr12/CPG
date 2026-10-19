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
    new Request(`http://cpg.test/api/tenants/prod/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    context(id),
  );

describe("/api/tenants/{tenant}/customers/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads the path's customer in the path's tenant, for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { customerService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002" });

    const response = await route.GET(new Request("http://cpg.test/api/tenants/prod/customers/00000002"), context("00000002"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002" } });
  });

  it("PATCH renames and (de)activates at the version sent, as the token (API-029)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { customerService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ id: "00000002", version: 3 });

    const response = await patch("00000002", { version: 2, name: " New ", active: false });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000002", version: 3 } });
    expect(mocks.update).toHaveBeenCalledWith("00000002", { name: "New", active: false }, 2, API_ACTOR);
  });

  it("PATCH refuses an ID in the body, a missing version and a body that changes nothing", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const renamed = await patch("00000002", { version: 1, id: "00000009", active: true });
    const unversioned = await patch("00000002", { name: "x" });
    const empty = await patch("00000002", { version: 1 });

    expect((await renamed.json()).error.fieldErrors).toEqual({ id: ["A record's ID can't be changed."] });
    expect((await unversioned.json()).error.fieldErrors).toHaveProperty("version");
    expect((await empty.json()).error.fieldErrors).toEqual({ changes: ["Send at least one of name or active."] });
    expect([renamed.status, unversioned.status, empty.status]).toEqual([400, 400, 400]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PATCH forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await patch("00000002", { version: 1, active: false })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
