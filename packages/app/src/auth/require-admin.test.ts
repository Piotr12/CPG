import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentUser, requireAdmin, requireUser } from "./require-admin";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" as const };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" as const };
const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  requestScope: vi.fn(),
  readSessionToken: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@cpg/core", () => ({ requestScope: mocks.requestScope }));
vi.mock("./session-cookie", () => ({ readSessionToken: mocks.readSessionToken }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: mocks.unstable_rethrow }));

describe("currentUser", () => {
  beforeEach(() => {
    mocks.requestScope.mockResolvedValue({ cradle: { authService: { validateSession: mocks.validateSession } } });
    mocks.readSessionToken.mockResolvedValue("tok");
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("validates the cookie's token", async () => {
    mocks.validateSession.mockResolvedValue(admin);

    await expect(currentUser()).resolves.toBe(admin);
    expect(mocks.validateSession).toHaveBeenCalledWith("tok");
  });

  it("doesn't touch the database without a session cookie", async () => {
    mocks.readSessionToken.mockResolvedValue(undefined);

    await expect(currentUser()).resolves.toBeNull();
    expect(mocks.requestScope).not.toHaveBeenCalled();
  });

  it("treats an error as signed out and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("database is locked");
    mocks.validateSession.mockRejectedValue(error);

    await expect(currentUser()).resolves.toBeNull();
    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(error);
    expect(log).toHaveBeenCalledWith("Session check failed:", error);
  });

  it("lets Next.js control-flow errors through", async () => {
    const dynamic = new Error("Dynamic server usage");
    mocks.readSessionToken.mockRejectedValue(dynamic);
    mocks.unstable_rethrow.mockImplementation((error: unknown) => {
      throw error;
    });

    await expect(currentUser()).rejects.toBe(dynamic);
  });
});

describe("gates", () => {
  beforeEach(() => {
    mocks.requestScope.mockResolvedValue({ cradle: { authService: { validateSession: mocks.validateSession } } });
    mocks.readSessionToken.mockResolvedValue("tok");
  });
  afterEach(() => vi.clearAllMocks());

  describe("requireUser", () => {
    it.each([
      ["the admin", admin],
      ["a normal user", alice],
    ])("returns %s", async (_case, user) => {
      mocks.validateSession.mockResolvedValue(user);

      await expect(requireUser()).resolves.toBe(user);
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("redirects to sign-in without a session", async () => {
      mocks.validateSession.mockResolvedValue(null);

      await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT /login");
    });
  });

  describe("requireAdmin", () => {
    it("returns the admin", async () => {
      mocks.validateSession.mockResolvedValue(admin);

      await expect(requireAdmin()).resolves.toBe(admin);
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("sends a normal user back to /admin", async () => {
      mocks.validateSession.mockResolvedValue(alice);

      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT /admin");
    });

    it("redirects to sign-in without a session", async () => {
      mocks.validateSession.mockResolvedValue(null);

      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT /login");
    });
  });
});
