import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../../auth/api-write";
import { GET, PATCH } from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({
  tenantScope: vi.fn(),
  requireApiUser: vi.fn(),
  setReadOnly: vi.fn(),
  caller: { current: null as unknown },
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../../auth/api-write", async () => {
  const { apiHandler } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  return {
    apiWrite: (handler: (write: WriteContext<unknown>) => Promise<unknown>, options?: { authorize?: (c: unknown) => unknown }) =>
      apiHandler(async (request: Request, context: unknown) => {
        options?.authorize?.(mocks.caller.current);
        return handler({
          request,
          context,
          caller: mocks.caller.current as WriteContext<unknown>["caller"],
          body: await request.json(),
          cradle: { tenantService: { setReadOnly: mocks.setReadOnly } } as unknown as WriteContext<unknown>["cradle"],
        });
      }),
  };
});

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const get = (tenant: string) =>
  GET(new Request(`http://cpg.test/api/tenants/${tenant}`), { params: Promise.resolve({ tenant }) });
const patch = (tenant: string, body: unknown) =>
  PATCH(new Request(`http://cpg.test/api/tenants/${tenant}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ tenant }),
  });

describe("GET /api/tenants/{tenant}", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the tenant read through its own scope, with its read-only flag (API-013)", async () => {
    const prod = { code: "prod", name: "Prod", generation: 1, readOnly: true };
    mocks.requireApiUser.mockResolvedValue({ username: "admin" });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: prod } });

    const response = await get("prod");

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.requireApiUser).toHaveBeenCalledWith(expect.any(Request));
    expect(await response.json()).toEqual({ ok: true, data: prod });
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

describe("PATCH /api/tenants/{tenant}", () => {
  afterEach(() => vi.clearAllMocks());

  it("sets the path's tenant read-only, audited as the token (R05, R07)", async () => {
    mocks.caller.current = ADMIN_TOKEN;
    mocks.setReadOnly.mockResolvedValue({ code: "prod", name: "Prod", generation: 1, readOnly: true });

    const response = await patch("prod", { readOnly: true });

    expect(await response.json()).toEqual({ ok: true, data: { code: "prod", name: "Prod", generation: 1, readOnly: true } });
    expect(mocks.setReadOnly).toHaveBeenCalledWith("prod", true, {
      userId: "u1",
      username: "admin",
      sessionId: null,
      channel: "api",
      token: { id: "t1", name: "ops" },
    });
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("refuses a missing or non-boolean flag, and any other field, with 400", async () => {
    mocks.caller.current = ADMIN_TOKEN;

    for (const body of [{}, { readOnly: "yes" }, { readOnly: true, generation: 2 }]) {
      const response = await patch("test", body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
    expect(mocks.setReadOnly).not.toHaveBeenCalled();
  });

  it("answers an unknown tenant with 404 TENANT_NOT_FOUND, before the body", async () => {
    mocks.caller.current = ADMIN_TOKEN;

    const response = await patch("TEST", { readOnly: "not even a boolean" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: { code: "TENANT_NOT_FOUND", message: "Unknown tenant." } });
    expect(mocks.setReadOnly).not.toHaveBeenCalled();
  });

  it("forbids a normal user's token", async () => {
    mocks.caller.current = { ...ADMIN_TOKEN, role: "user" };

    expect((await patch("prod", { readOnly: true })).status).toBe(403);
    expect(mocks.setReadOnly).not.toHaveBeenCalled();
  });
});
