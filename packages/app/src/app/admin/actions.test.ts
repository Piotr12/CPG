import { afterEach, describe, expect, it, vi } from "vitest";
import { signOut } from "./actions";

const mocks = vi.hoisted(() => ({
  authService: { signOut: vi.fn() },
  readSessionToken: vi.fn(),
  clearSessionCookie: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("@cpg/core", () => ({ requestScope: async () => ({ cradle: { authService: mocks.authService } }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../auth/require-admin", () => ({ SIGN_IN_PATH: "/login" }));
vi.mock("../../auth/session-cookie", () => ({
  readSessionToken: mocks.readSessionToken,
  clearSessionCookie: mocks.clearSessionCookie,
}));

describe("signOut", () => {
  afterEach(() => vi.clearAllMocks());

  it("ends the session, clears the cookie and goes to /login", async () => {
    mocks.readSessionToken.mockResolvedValue("tok");

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");

    expect(mocks.authService.signOut).toHaveBeenCalledWith("tok");
    expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
