import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentPreferences } from "./current-preferences";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  get: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { userPreferenceService: { get: mocks.get } } }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.unstable_rethrow }));
vi.mock("../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("currentPreferences", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue({ sessionId: "s1", userId: "u1", username: "admin", role: "admin" });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("gives a visitor English and light without a database read (spec Q4)", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(currentPreferences()).resolves.toEqual({ locale: "en", theme: "light" });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("reads the signed-in account's stored choices", async () => {
    mocks.get.mockResolvedValue({ locale: "pl", theme: "dark" });

    await expect(currentPreferences()).resolves.toEqual({ locale: "pl", theme: "dark" });
    expect(mocks.get).toHaveBeenCalledWith("u1");
  });

  it("falls back to the defaults and logs when the read fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("database is locked");
    mocks.get.mockRejectedValue(failure);

    await expect(currentPreferences()).resolves.toEqual({ locale: "en", theme: "light" });
    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(failure);
    expect(log).toHaveBeenCalledWith("Preference lookup failed:", failure);
  });
});
