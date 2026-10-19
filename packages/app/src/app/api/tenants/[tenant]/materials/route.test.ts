import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const context = (tenant: string) => ({ params: Promise.resolve({ tenant }) });
const post = (body: unknown) =>
  route.POST(new Request("http://cpg.test/api/tenants/prod/materials", { method: "POST", body: JSON.stringify(body) }), context("prod"));

describe("/api/tenants/{tenant}/materials", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's materials for any signed-in account, through that tenant's scope", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { materialService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/test/materials"), context("test"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(await response.json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
  });

  it("GET checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/materials"), context("test"))).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates from the parsed body, audited as the token (R07, MAT-001)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { materialService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000003" });

    const response = await post({ type: "raw", description: " Bolt ", baseUnit: "each", id: "00000009" });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000003" } });
    expect(mocks.create).toHaveBeenCalledWith({ type: "raw", description: "Bolt", baseUnit: "each" }, API_ACTOR);
  });

  it("POST names the missing fields and creates nothing (MAT-005, MAT-008)", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const response = await post({ type: "service" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["baseUnit", "description", "type"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("POST forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post({ type: "raw", description: "Bolt", baseUnit: "each" })).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
