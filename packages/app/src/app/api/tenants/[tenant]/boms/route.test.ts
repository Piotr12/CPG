import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const API_ACTOR = { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } };
const LINES = [{ material: "00000004", quantity: "4", unit: "each" }];

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
  route.POST(new Request("http://cpg.test/api/tenants/prod/boms", { method: "POST", body: JSON.stringify(body) }), context("prod"));

describe("/api/tenants/{tenant}/boms", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET lists the tenant's BOMs for any signed-in account, through that tenant's scope", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { bomService: { list: mocks.list } } });
    mocks.list.mockResolvedValue([{ id: "00000001" }]);

    const response = await route.GET(new Request("http://cpg.test/api/tenants/test/boms"), context("test"));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(await response.json()).toEqual({ ok: true, data: [{ id: "00000001" }] });
  });

  it("GET checks the caller before opening the tenant", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    expect((await route.GET(new Request("http://cpg.test/api/tenants/test/boms"), context("test"))).status).toBe(401);
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("POST creates from the parsed body, with no end when validThrough is left out, audited as the token (R07)", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { bomService: { create: mocks.create } };
    mocks.create.mockResolvedValue({ id: "00000003" });

    const response = await post({ output: "00000005", priority: 1, validFrom: "2027-01-01", components: [{ ...LINES[0], quantity: "4.0" }] });

    expect(await response.json()).toEqual({ ok: true, data: { id: "00000003" } });
    expect(mocks.create).toHaveBeenCalledWith(
      { output: "00000005", priority: 1, validFrom: "2027-01-01", validThrough: null, components: LINES },
      API_ACTOR,
    );
  });

  it("POST names the invalid fields, by line, and creates nothing", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const response = await post({ output: "5", priority: "1", validFrom: "2027-02-30", components: [{ material: "00000004", quantity: 4, unit: "each" }] });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["components.0.quantity", "output", "priority", "validFrom"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("POST forbids a normal user's token (API-010)", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post({ output: "00000005", priority: 1, validFrom: "2027-01-01", components: LINES })).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
