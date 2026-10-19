import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, readSessionToken, SESSION_COOKIE, writeSessionCookie } from "./session-cookie";

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

describe("session cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T08:00:00Z") });
  });
  afterEach(() => vi.useRealTimers());

  it("reads the token from the session cookie", async () => {
    jar.get.mockReturnValue({ value: "tok" });

    await expect(readSessionToken()).resolves.toBe("tok");
    expect(jar.get).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("reads nothing when there is no cookie", async () => {
    jar.get.mockReturnValue(undefined);

    await expect(readSessionToken()).resolves.toBeUndefined();
  });

  it.each([true, false])("writes an httpOnly, lax, site-wide cookie that lives as long as the session (secure: %s)", async (secure) => {
    await writeSessionCookie("tok", new Date("2026-10-19T20:00:00Z"), { secure });

    expect(jar.set).toHaveBeenCalledWith("cpg_session", "tok", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  });

  it("never sets a negative lifetime", async () => {
    await writeSessionCookie("tok", new Date("2026-10-19T07:00:00Z"), { secure: true });

    expect(jar.set).toHaveBeenCalledWith("cpg_session", "tok", expect.objectContaining({ maxAge: 0 }));
  });

  it("deletes the cookie", async () => {
    await clearSessionCookie();

    expect(jar.delete).toHaveBeenCalledWith("cpg_session");
  });
});
