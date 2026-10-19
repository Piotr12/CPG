import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { signOut, updatePreferences } from "./actions";

const mocks = vi.hoisted(() => ({
  authService: { signOut: vi.fn() },
  userPreferenceService: { update: vi.fn() },
  config: { env: "production" },
  currentUser: vi.fn(),
  getMessages: vi.fn(),
  readSessionToken: vi.fn(),
  clearSessionCookie: vi.fn(),
  writeThemeCookie: vi.fn(),
  clearThemeCookie: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({
    cradle: { authService: mocks.authService, userPreferenceService: mocks.userPreferenceService, config: mocks.config },
  }),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../auth/require-admin", () => ({ SIGN_IN_PATH: "/login", currentUser: mocks.currentUser }));
vi.mock("../../auth/session-cookie", () => ({
  readSessionToken: mocks.readSessionToken,
  clearSessionCookie: mocks.clearSessionCookie,
}));
vi.mock("../../preferences/theme-cookie", () => ({
  writeThemeCookie: mocks.writeThemeCookie,
  clearThemeCookie: mocks.clearThemeCookie,
}));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("signOut", () => {
  afterEach(() => vi.clearAllMocks());

  it("ends the session, clears both cookies and goes to /login", async () => {
    mocks.readSessionToken.mockResolvedValue("tok");

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");

    expect(mocks.authService.signOut).toHaveBeenCalledWith("tok");
    expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
    expect(mocks.clearThemeCookie).toHaveBeenCalledOnce();
  });
});

describe("updatePreferences", () => {
  const user = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };

  beforeEach(() => {
    mocks.config.env = "production";
    mocks.currentUser.mockResolvedValue(user);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("saves the signed-in account's language, keeps the theme cookie in step and re-renders", async () => {
    mocks.userPreferenceService.update.mockResolvedValue({ locale: "pl", theme: "dark" });

    await expect(updatePreferences({}, form({ locale: "pl" }))).resolves.toEqual({});

    expect(mocks.userPreferenceService.update).toHaveBeenCalledWith("u1", { locale: "pl" });
    expect(mocks.writeThemeCookie).toHaveBeenCalledWith("dark", { secure: true });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("only ever writes the caller's own account", async () => {
    mocks.userPreferenceService.update.mockResolvedValue({ locale: "en", theme: "dark" });

    await updatePreferences({}, form({ theme: "dark", userId: "someone-else" }));

    expect(mocks.userPreferenceService.update).toHaveBeenCalledWith("u1", { theme: "dark" });
  });

  it("doesn't mark the cookie secure outside production", async () => {
    mocks.config.env = "development";
    mocks.userPreferenceService.update.mockResolvedValue({ locale: "en", theme: "light" });

    await updatePreferences({}, form({ theme: "light" }));

    expect(mocks.writeThemeCookie).toHaveBeenCalledWith("light", { secure: false });
  });

  it("sends a visitor whose session ended to /login", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(updatePreferences({}, form({ theme: "dark" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.userPreferenceService.update).not.toHaveBeenCalled();
  });

  it("refuses a value outside the lists, in the reader's language", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    await expect(updatePreferences({}, form({ locale: "de" }))).resolves.toEqual({
      error: "Niektóre pola są nieprawidłowe.",
    });
    expect(mocks.userPreferenceService.update).not.toHaveBeenCalled();
    expect(mocks.writeThemeCookie).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refuses an empty submission", async () => {
    await expect(updatePreferences({}, form({}))).resolves.toEqual({ error: "Some fields are invalid." });
  });
});
