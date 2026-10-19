import { afterEach, describe, expect, it, vi } from "vitest";
import { clearThemeCookie, writeThemeCookie } from "./theme-cookie";

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

describe("theme cookie", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([true, false])("writes a script-readable, lax, site-wide cookie for a year (secure: %s)", async (secure) => {
    await writeThemeCookie("dark", { secure });

    expect(jar.set).toHaveBeenCalledWith("cpg_theme", "dark", {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 31_536_000,
    });
  });

  it("deletes it", async () => {
    await clearThemeCookie();

    expect(jar.delete).toHaveBeenCalledWith("cpg_theme");
  });
});
