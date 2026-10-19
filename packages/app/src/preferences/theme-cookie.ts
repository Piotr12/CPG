import { cookies } from "next/headers";
import type { Theme } from "@cpg/core";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_S } from "./theme";

/** Server Functions and Route Handlers only, like the session cookie. Readable by scripts on purpose. */
export async function writeThemeCookie(theme: Theme, { secure }: { secure: boolean }) {
  (await cookies()).set(THEME_COOKIE, theme, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE_S,
  });
}

export async function clearThemeCookie() {
  (await cookies()).delete(THEME_COOKIE);
}
