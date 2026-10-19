import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ revoke: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  apiHandler: (await importOriginal<typeof import("@cpg/core")>()).apiHandler,
  callerActor: (await importOriginal<typeof import("@cpg/core")>()).callerActor,
  requestScope: async () => ({ cradle: { apiTokenService: { revoke: mocks.revoke } } }),
}));
vi.mock("../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const remove = (id: string) =>
  route.DELETE(new Request(`http://cpg.test/api/tokens/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

describe("DELETE /api/tokens/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("revokes the caller's own token (API-008)", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "alice", role: "user", tokenId: "t9", tokenName: "ci" });
    mocks.revoke.mockResolvedValue({ id: "t1" });

    const response = await remove("t1");

    expect(mocks.requireApiUser).toHaveBeenCalledWith(expect.any(Request));
    // The Global audit names the token that made the call (AUD-007).
    expect(mocks.revoke).toHaveBeenCalledWith("u2", "t1", {
      userId: "u2",
      username: "alice",
      sessionId: null,
      channel: "api",
      token: { id: "t9", name: "ci" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { id: "t1" } });
  });

  it("answers 404 TOKEN_NOT_FOUND for another account's or a malformed id", async () => {
    const { NotFoundError } = await core();
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "alice", role: "user" });
    mocks.revoke.mockRejectedValue(new NotFoundError("TOKEN_NOT_FOUND", "No such token."));

    const response = await remove("not-a-uuid");

    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "TOKEN_NOT_FOUND", message: "No such token." });
  });

  it("refuses an unauthenticated caller before revoking anything", async () => {
    const { UnauthorizedError } = await core();
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError("Use a bearer token for this request."));

    expect((await remove("t1")).status).toBe(401);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("only revokes: no other method is defined", () => {
    expect(Object.keys(route)).toEqual(["DELETE"]);
  });
});
