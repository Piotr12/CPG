import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiWrite, tenantApiWrite } from "./api-write";

const TOKEN_CALLER = { userId: "u1", username: "alice", role: "user", tokenId: "t1", tokenName: "ci" } as const;

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  requestScope: vi.fn(),
  tenantScope: vi.fn(),
  /** A stand-in for IdempotencyService.run: stores the first result as JSON, replays it after. */
  stored: new Map<string, unknown>(),
  run: vi.fn(),
}));
vi.mock("./require-api-user", () => ({
  BEARER_REQUIRED: "Use a bearer token for this request.",
  requireApiUser: mocks.requireApiUser,
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: mocks.requestScope,
  tenantScope: mocks.tenantScope,
}));

const cradle = { idempotencyService: { run: mocks.run } };

function post(body: string | undefined, headers: Record<string, string> = { "Idempotency-Key": "k1" }) {
  return new Request("http://cpg.test/api/things?ignored=1", { method: "POST", headers, body });
}

describe("apiWrite", () => {
  beforeEach(() => {
    mocks.requireApiUser.mockResolvedValue(TOKEN_CALLER);
    mocks.requestScope.mockResolvedValue({ cradle });
    mocks.stored.clear();
    mocks.run.mockImplementation(async (request: { key: string }, _scope: unknown, write: () => Promise<unknown>) => {
      if (mocks.stored.has(request.key)) return { data: mocks.stored.get(request.key), replayed: true };
      const data = await write();
      mocks.stored.set(request.key, JSON.parse(JSON.stringify(data)));
      return { data, replayed: false };
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("runs the handler through the global key store with the caller, the body and the scope's services", async () => {
    const handler = vi.fn(async () => ({ id: "x1" }));
    const context = { params: Promise.resolve({}) };

    const response = await apiWrite(handler)(post('{"name":"widget"}'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: "x1" } });
    expect(response.headers.get("Idempotent-Replayed")).toBeNull();
    expect(handler).toHaveBeenCalledWith({
      request: expect.any(Request),
      context,
      caller: TOKEN_CALLER,
      body: { name: "widget" },
      cradle,
    });
    const { fingerprintOf } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    const expected = await fingerprintOf({ method: "POST", path: "/api/things", body: { name: "widget" } });
    expect(mocks.run).toHaveBeenCalledWith(
      { userId: "u1", key: "k1", operation: "POST /api/things", fingerprint: expected },
      { kind: "global" },
      expect.any(Function),
    );
  });

  it("answers a replay with the first response, byte for byte, marked Idempotent-Replayed", async () => {
    const route = apiWrite(async () => ({ id: "x1", createdAt: new Date("2026-10-19T16:00:00Z") }));

    const first = await route(post("{}"), {});
    const again = await route(post("{}"), {});

    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(again.status).toBe(200);
    expect(await again.text()).toBe(await first.text());
  });

  it("fingerprints a secret-bearing body with argon2id", async () => {
    await apiWrite(async () => "ok", { secretBody: true })(post('{"password":"a password 123"}'), {});

    expect(mocks.run.mock.calls[0][0].fingerprint.stored).toMatch(/^\$argon2id\$/);
  });

  it("passes a missing body as null", async () => {
    const handler = vi.fn(async () => "ok");

    await apiWrite(handler)(post(undefined), {});

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ body: null }));
  });

  it("refuses a body that isn't JSON with 400 VALIDATION_FAILED, before any write", async () => {
    const response = await apiWrite(vi.fn())(post("{not json"), {});

    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({ code: "VALIDATION_FAILED", message: "The request body must be JSON." });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("refuses a write without an Idempotency-Key with 400, before opening a scope (API-019)", async () => {
    const response = await apiWrite(vi.fn())(post("{}", {}), {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(mocks.requestScope).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller with 401 before looking at the key", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError("Invalid or revoked token."));

    const response = await apiWrite(vi.fn())(post("{}", {}), {});

    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toBe("Invalid or revoked token.");
  });

  it("runs the route's authorize first: 403 before the key, the body or any hashing", async () => {
    const { ForbiddenError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    const authorize = vi.fn(() => {
      throw new ForbiddenError();
    });

    const response = await apiWrite(vi.fn(), { secretBody: true, authorize })(post("{not json", {}), {});

    expect(response.status).toBe(403);
    expect(authorize).toHaveBeenCalledWith(TOKEN_CALLER);
    expect(mocks.requestScope).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("refuses a session caller: writes need a bearer token", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u1", username: "alice", role: "user", sessionId: "s1" });

    const response = await apiWrite(vi.fn())(post("{}"), {});

    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toBe("Use a bearer token for this request.");
  });

  it("maps the handler's own errors through the envelope, without the replay header", async () => {
    const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");

    const response = await apiWrite(async () => {
      throw new ConflictError("Reload and try again.", "VERSION_CONFLICT");
    })(post("{}"), {});

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("VERSION_CONFLICT");
    expect(response.headers.get("Idempotent-Replayed")).toBeNull();
  });
});

describe("tenantApiWrite", () => {
  const tenantCradle = (code: string) => ({ ...cradle, tenant: { code, name: code, generation: 1 } });
  const write = (tenant: string, headers: Record<string, string>, body = "{}") =>
    tenantApiWrite(async ({ cradle }) => `written in ${(cradle as unknown as { tenant: { code: string } }).tenant.code}`)(
      new Request(`http://cpg.test/api/tenants/${tenant}/things`, { method: "POST", headers, body }),
      { params: Promise.resolve({ tenant }) },
    );

  beforeEach(() => {
    mocks.requireApiUser.mockResolvedValue(TOKEN_CALLER);
    mocks.tenantScope.mockImplementation(async (code: string) => ({ cradle: tenantCradle(code) }));
    mocks.run.mockImplementation(async (_request: unknown, _scope: unknown, run: () => Promise<unknown>) => ({
      data: await run(),
      replayed: false,
    }));
  });
  afterEach(() => vi.clearAllMocks());

  it("writes in the path's tenant scope, keyed in Test's store with the required generation", async () => {
    const response = await write("test", { "Idempotency-Key": "k1", "Dataset-Generation": "3" });

    expect(await response.json()).toEqual({ ok: true, data: "written in test" });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "POST /api/tenants/test/things" }),
      { kind: "tenant", tenant: "test", generation: 3, requireGeneration: true },
      expect.any(Function),
    );
  });

  it("leaves the generation optional in Prod", async () => {
    await write("prod", { "Idempotency-Key": "k1" });

    expect(mocks.run).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "tenant", tenant: "prod", generation: null, requireGeneration: false },
      expect.any(Function),
    );
  });

  it("refuses a malformed generation with 428 GENERATION_REQUIRED (API-034)", async () => {
    const response = await write("test", { "Idempotency-Key": "k1", "Dataset-Generation": "latest" });

    expect(response.status).toBe(428);
    expect((await response.json()).error.code).toBe("GENERATION_REQUIRED");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown tenant before reading the body", async () => {
    const { tenantNotFound } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.tenantScope.mockRejectedValue(tenantNotFound());

    const response = await write("staging", { "Idempotency-Key": "k1" }, "{not json");

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("TENANT_NOT_FOUND");
  });
});
