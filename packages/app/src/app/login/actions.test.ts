import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "./actions";

const expiresAt = new Date("2026-10-19T20:00:00Z");
const mocks = vi.hoisted(() => ({
  authService: { signIn: vi.fn(), signOut: vi.fn() },
  config: { env: "production" },
  headers: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  writeSessionCookie: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { authService: mocks.authService, config: mocks.config } }),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../auth/session-cookie", () => ({ writeSessionCookie: mocks.writeSessionCookie }));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("signIn", () => {
  beforeEach(() => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7" }));
    mocks.config.env = "production";
  });
  afterEach(() => vi.clearAllMocks());

  it("signs in with the client's IP, sets a secure cookie and goes to /admin", async () => {
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt });

    await expect(signIn({}, form({ username: " admin ", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.authService.signIn).toHaveBeenCalledWith({ username: "admin", password: "pw", clientIp: "203.0.113.7" });
    expect(mocks.writeSessionCookie).toHaveBeenCalledWith("tok", expiresAt, { secure: true });
  });

  it("doesn't mark the cookie secure outside production", async () => {
    mocks.config.env = "development";
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt });

    await expect(signIn({}, form({ username: "admin", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.writeSessionCookie).toHaveBeenCalledWith("tok", expiresAt, { secure: false });
  });

  it("shows the service's message when the credentials are refused", async () => {
    const { UnauthorizedError } = await import("@cpg/core");
    mocks.authService.signIn.mockRejectedValue(new UnauthorizedError("Invalid username or password."));

    await expect(signIn({}, form({ username: "admin", password: "nope" }))).resolves.toEqual({
      error: "Invalid username or password.",
    });
    expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty password", { username: "admin", password: "" }],
    ["a missing field", { username: "admin" }],
    ["a blank username", { username: "   ", password: "pw" }],
  ])("asks for both fields on %s without calling the service", async (_case, fields) => {
    await expect(signIn({}, form(fields))).resolves.toEqual({ error: "Enter your username and password." });
    expect(mocks.authService.signIn).not.toHaveBeenCalled();
  });

  it("answers an over-long password like any wrong credentials", async () => {
    await expect(signIn({}, form({ username: "admin", password: "x".repeat(257) }))).resolves.toEqual({
      error: "Invalid username or password.",
    });
    expect(mocks.authService.signIn).not.toHaveBeenCalled();
  });
});
