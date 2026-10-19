// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readThemeCookie, THEME_COOKIE, THEME_COOKIE_MAX_AGE_S, THEME_SCRIPT, themeCookieAssignment } from "./theme";

const runThemeScript = () => new Function(THEME_SCRIPT)();
const clearCookies = () => {
  for (const pair of document.cookie.split("; ").filter(Boolean)) {
    document.cookie = `${pair.split("=")[0]}=; Max-Age=0; Path=/`;
  }
};

describe("THEME_SCRIPT", () => {
  afterEach(() => {
    document.documentElement.className = "";
    clearCookies();
  });

  it("paints the dark theme when the cookie says dark", () => {
    document.cookie = "other=1; Path=/";
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;

    runThemeScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it.each(["light", "darkest", ""])("leaves the page light for %j", (value) => {
    document.cookie = `${THEME_COOKIE}=${value}; Path=/`;

    runThemeScript();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("stays light, without throwing, where cookies can't be read (a sandboxed frame)", () => {
    const getter = vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new DOMException("The document is sandboxed", "SecurityError");
    });

    expect(runThemeScript).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    getter.mockRestore();
  });

  it("leaves the page light without the cookie", () => {
    runThemeScript();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("readThemeCookie", () => {
  it.each([
    ["cpg_theme=dark", "dark"],
    ["a=1; cpg_theme=light; b=2", "light"],
    ["cpg_theme=sepia", null],
    ["not_cpg_theme=dark", null],
    ["", null],
  ])("reads %j as %s", (header, theme) => {
    expect(readThemeCookie(header)).toBe(theme);
  });
});

describe("themeCookieAssignment", () => {
  it("sets a site-wide, lax cookie that lasts a year", () => {
    expect(THEME_COOKIE_MAX_AGE_S).toBe(31_536_000);
    expect(themeCookieAssignment("dark", { secure: false })).toBe("cpg_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("marks it secure over HTTPS", () => {
    expect(themeCookieAssignment("light", { secure: true })).toBe(
      "cpg_theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
  });

  it("deletes it when there is no theme to remember", () => {
    expect(themeCookieAssignment(null, { secure: false })).toBe("cpg_theme=; Path=/; Max-Age=0; SameSite=Lax");
  });
});
