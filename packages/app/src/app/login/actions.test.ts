import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "./actions";

const expiresAt = new Date("2026-10-19T20:00:00Z");
const mocks = vi.hoisted(() => ({
  authService: { signIn: vi.fn(), signOut: vi.fn() },
  userPreferenceService: { get: vi.fn() },
  config: { env: "production" },
  headers: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
  writeSessionCookie: vi.fn(),
  writeThemeCookie: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({
    cradle: { authService: mocks.authService, userPreferenceService: mocks.userPreferenceService, config: mocks.config },
  }),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../auth/session-cookie", () => ({ writeSessionCookie: mocks.writeSessionCookie }));
vi.mock("../../preferences/theme-cookie", () => ({ writeThemeCookie: mocks.writeThemeCookie }));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("signIn", () => {
  beforeEach(() => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7" }));
    mocks.config.env = "production";
    mocks.userPreferenceService.get.mockResolvedValue({ locale: "en", theme: "light" });
  });
  afterEach(() => vi.clearAllMocks());

  it("signs in with the client's IP, sets a secure cookie and goes to /admin", async () => {
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt, userId: "u1" });

    await expect(signIn({}, form({ username: " admin ", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.authService.signIn).toHaveBeenCalledWith({ username: "admin", password: "pw", clientIp: "203.0.113.7" });
    expect(mocks.writeSessionCookie).toHaveBeenCalledWith("tok", expiresAt, { secure: true });
  });

  it("sets the theme cookie from the account's stored theme, for the first paint (UX-007)", async () => {
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt, userId: "u1" });
    mocks.userPreferenceService.get.mockResolvedValue({ locale: "pl", theme: "dark" });

    await expect(signIn({}, form({ username: "admin", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.userPreferenceService.get).toHaveBeenCalledWith("u1");
    expect(mocks.writeThemeCookie).toHaveBeenCalledWith("dark", { secure: true });
  });

  it("still signs in, with the light theme, when the preference read fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("database is locked");
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt, userId: "u1" });
    mocks.userPreferenceService.get.mockRejectedValue(failure);

    await expect(signIn({}, form({ username: "admin", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.writeSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.writeThemeCookie).toHaveBeenCalledWith("light", { secure: true });
    expect(log).toHaveBeenCalledWith("Preference lookup at sign-in failed:", failure);
    log.mockRestore();
  });

  it("doesn't mark the cookie secure outside production", async () => {
    mocks.config.env = "development";
    mocks.authService.signIn.mockResolvedValue({ token: "tok", expiresAt, userId: "u1" });

    await expect(signIn({}, form({ username: "admin", password: "pw" }))).rejects.toThrow("NEXT_REDIRECT /admin");

    expect(mocks.writeSessionCookie).toHaveBeenCalledWith("tok", expiresAt, { secure: false });
    expect(mocks.writeThemeCookie).toHaveBeenCalledWith("light", { secure: false });
  });

  it("shows the service's message when the credentials are refused", async () => {
    const { UnauthorizedError } = await import("@cpg/core");
    mocks.authService.signIn.mockRejectedValue(new UnauthorizedError("Invalid username or password."));

    await expect(signIn({}, form({ username: "admin", password: "nope" }))).resolves.toEqual({
      error: "Invalid username or password.",
    });
    expect(mocks.writeSessionCookie).not.toHaveBeenCalled();
    expect(mocks.writeThemeCookie).not.toHaveBeenCalled();
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
