import { afterEach, describe, expect, it, vi } from "vitest";
import { BEARER_REQUIRED, INVALID_TOKEN, requireApiUser } from "./require-api-user";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    code = "UNAUTHORIZED";
  }
  return { UnauthorizedError, currentUser: vi.fn(), authenticate: vi.fn() };
});
vi.mock("@cpg/core", () => ({
  UnauthorizedError: mocks.UnauthorizedError,
  requestScope: async () => ({ cradle: { apiTokenService: { authenticate: mocks.authenticate } } }),
}));
vi.mock("./require-admin", () => ({ currentUser: mocks.currentUser }));

const SECRET = "cpg_secret";
const session = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const tokenOwner = { userId: "u2", username: "alice", role: "user", tokenId: "t1", tokenName: "agent1" };

const request = (method: string, authorization?: string) =>
  new Request("http://cpg.test/api/x", { method, headers: authorization ? { authorization } : {} });

describe("requireApiUser", () => {
  afterEach(() => vi.resetAllMocks());

  describe("with a bearer token", () => {
    it("returns the token's owner for any method", async () => {
      mocks.authenticate.mockResolvedValue(tokenOwner);

      await expect(requireApiUser(request("GET", `Bearer ${SECRET}`))).resolves.toBe(tokenOwner);
      await expect(requireApiUser(request("DELETE", `Bearer ${SECRET}`))).resolves.toBe(tokenOwner);
      expect(mocks.authenticate).toHaveBeenCalledWith(SECRET);
      expect(mocks.currentUser).not.toHaveBeenCalled();
    });

    it("matches the scheme case-insensitively and ignores extra spaces", async () => {
      mocks.authenticate.mockResolvedValue(tokenOwner);

      await expect(requireApiUser(request("GET", `  bEaReR   ${SECRET}  `))).resolves.toBe(tokenOwner);
      expect(mocks.authenticate).toHaveBeenCalledWith(SECRET);
    });

    it("refuses a bad token with one message, never falling back to a valid session", async () => {
      mocks.authenticate.mockResolvedValue(null);
      mocks.currentUser.mockResolvedValue(session);

      await expect(requireApiUser(request("GET", `Bearer ${SECRET}`))).rejects.toEqual(
        new mocks.UnauthorizedError(INVALID_TOKEN),
      );
      expect(mocks.currentUser).not.toHaveBeenCalled();
    });

    it("refuses an empty bearer header without a lookup", async () => {
      mocks.currentUser.mockResolvedValue(session);

      for (const header of ["Bearer", "Bearer    "]) {
        await expect(requireApiUser(request("GET", header))).rejects.toEqual(new mocks.UnauthorizedError(INVALID_TOKEN));
      }
      expect(mocks.authenticate).not.toHaveBeenCalled();
    });

    it("fails closed when the check itself fails", async () => {
      mocks.authenticate.mockRejectedValue(new Error("database is gone"));

      await expect(requireApiUser(request("GET", `Bearer ${SECRET}`))).rejects.toThrow("database is gone");
    });
  });

  describe("without a bearer token", () => {
    it("accepts the session cookie on GET and HEAD, including next to another scheme", async () => {
      mocks.currentUser.mockResolvedValue(session);

      await expect(requireApiUser(request("GET"))).resolves.toBe(session);
      await expect(requireApiUser(request("HEAD"))).resolves.toBe(session);
      await expect(requireApiUser(request("GET", "Basic YWRtaW46eA=="))).resolves.toBe(session);
      expect(mocks.authenticate).not.toHaveBeenCalled();
    });

    it("refuses a safe request without a valid session", async () => {
      mocks.currentUser.mockResolvedValue(null);

      await expect(requireApiUser(request("GET"))).rejects.toEqual(new mocks.UnauthorizedError());
    });

    it("refuses a state-changing request even with a valid session (no CSRF exposure)", async () => {
      mocks.currentUser.mockResolvedValue(session);

      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        await expect(requireApiUser(request(method))).rejects.toEqual(new mocks.UnauthorizedError(BEARER_REQUIRED));
      }
      expect(mocks.currentUser).not.toHaveBeenCalled();
    });
  });
});
