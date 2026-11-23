import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  createApiHandler: (await importOriginal<typeof import("@cpg/core")>()).createApiHandler,
}));
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const request = () => new Request("http://cpg.test/api/me");

describe("GET /api/me", () => {
  afterEach(() => vi.clearAllMocks());

  it("answers a bearer caller's account, role and token name, never its secret", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "planner1", role: "user", tokenId: "t1", tokenName: "laptop agent" });
    const sent = request();

    const response = await route.GET(sent, undefined);

    expect(mocks.requireApiUser).toHaveBeenCalledWith(sent);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      data: { id: "u2", username: "planner1", role: "user", token: { id: "t1", name: "laptop agent" } },
    });
  });

  it("answers a session caller with no token, and leaves the session id out", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u1", username: "admin", role: "admin", sessionId: "s-secret" });

    const response = await route.GET(request(), undefined);
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({ ok: true, data: { id: "u1", username: "admin", role: "admin", token: null } });
    expect(text).not.toContain("s-secret");
  });

  it("refuses a caller without a credential with 401", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await route.GET(request(), undefined);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("is a read only", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
