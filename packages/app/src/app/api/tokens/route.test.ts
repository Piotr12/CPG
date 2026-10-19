import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ list: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  apiHandler: (await importOriginal<typeof import("@cpg/core")>()).apiHandler,
  requestScope: async () => ({ cradle: { apiTokenService: { list: mocks.list } } }),
}));
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const TOKENS = [{ id: "t1", name: "agent1", createdAt: "2026-10-19T11:00:00.000Z", lastUsedAt: null }];

describe("/api/tokens", () => {
  afterEach(() => vi.clearAllMocks());

  it("lists the caller's own tokens", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "alice", role: "user" });
    mocks.list.mockResolvedValue(TOKENS);
    const request = new Request("http://cpg.test/api/tokens");

    const response = await route.GET(request, undefined);

    expect(mocks.requireApiUser).toHaveBeenCalledWith(request);
    expect(mocks.list).toHaveBeenCalledWith("u2");
    expect(await response.json()).toEqual({ ok: true, data: TOKENS });
  });

  it("refuses an unauthenticated caller before reading anything", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError("Invalid or revoked token."));

    const response = await route.GET(new Request("http://cpg.test/api/tokens"), undefined);

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("offers no way to create a token (API-032)", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
