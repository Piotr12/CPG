import type { Theme } from "@cpg/core";

/**
 * A display hint, not a credential: the inline head script reads it to paint the right theme before
 * hydration, so it is deliberately not httpOnly. Nothing on the server trusts it; the account's stored
 * preference is the source of truth.
 */
export const THEME_COOKIE = "cpg_theme";
/** A year: a returning visitor on the same browser never sees a flash of the wrong theme. */
export const THEME_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/**
 * Runs in <head> before first paint. A constant with nothing interpolated at request time, and it only
 * ever adds the `dark` class on an exact match. A future CSP must allow it by hash, not nonce.
 * Reading `document.cookie` throws in a sandboxed frame; the page then simply stays light.
 */
export const THEME_SCRIPT = `try{document.cookie.split("; ").indexOf("${THEME_COOKIE}=dark")!==-1&&document.documentElement.classList.add("dark")}catch(e){}`;

/** The theme the cookie names; anything other than an exact `dark` or `light` counts as absent. */
export function readThemeCookie(cookieHeader: string): Theme | null {
  const value = cookieHeader
    .split("; ")
    .find((pair) => pair.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return value === "dark" || value === "light" ? value : null;
}

/** A `document.cookie` assignment that sets the theme, or deletes the cookie when `theme` is null. */
export function themeCookieAssignment(theme: Theme | null, { secure }: { secure: boolean }): string {
  const value = theme ?? "";
  const maxAge = theme ? THEME_COOKIE_MAX_AGE_S : 0;
  return `${THEME_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
