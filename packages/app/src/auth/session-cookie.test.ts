import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, readSessionToken, SESSION_COOKIE, writeSessionCookie } from "./session-cookie";

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

describe("session cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the token from the session cookie", async () => {
    jar.get.mockReturnValue({ value: "tok" });

    await expect(readSessionToken()).resolves.toBe("tok");
    expect(jar.get).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("reads nothing when there is no cookie", async () => {
    jar.get.mockReturnValue(undefined);

    await expect(readSessionToken()).resolves.toBeUndefined();
  });

  it.each([true, false])("writes an httpOnly, lax, site-wide cookie that expires with the session (secure: %s)", async (secure) => {
    const expiresAt = new Date("2026-10-19T20:00:00Z");

    await writeSessionCookie("tok", expiresAt, { secure });

    expect(jar.set).toHaveBeenCalledWith("cpg_session", "tok", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  });

  it("deletes the cookie", async () => {
    await clearSessionCookie();

    expect(jar.delete).toHaveBeenCalledWith("cpg_session");
  });
});
