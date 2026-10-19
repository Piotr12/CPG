import { describe, expect, it, vi } from "vitest";
import { requireApiUser } from "./require-api-user";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    code = "UNAUTHORIZED";
  }
  return { UnauthorizedError, currentUser: vi.fn() };
});
vi.mock("@cpg/core", () => ({ UnauthorizedError: mocks.UnauthorizedError }));
vi.mock("./require-admin", () => ({ currentUser: mocks.currentUser }));

describe("requireApiUser", () => {
  it("returns the signed-in account", async () => {
    const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
    mocks.currentUser.mockResolvedValue(admin);

    await expect(requireApiUser()).resolves.toBe(admin);
  });

  it("refuses a caller without a valid session", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(requireApiUser()).rejects.toBeInstanceOf(mocks.UnauthorizedError);
  });
});
