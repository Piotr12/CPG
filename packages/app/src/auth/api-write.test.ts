import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiWrite } from "./api-write";

const TOKEN_CALLER = { userId: "u1", username: "alice", role: "user", tokenId: "t1", tokenName: "ci" } as const;

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  requestScope: vi.fn(),
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
