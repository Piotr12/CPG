"use client";

import { useEffect } from "react";
import type { Locale, Theme } from "@cpg/core";
import { readThemeCookie, themeCookieAssignment } from "../../preferences/theme";

interface DocumentPreferencesProps {
  locale: Locale;
  theme: Theme;
  /** Signed out, the theme cookie is removed: visitors get the light default (spec Q4). */
  isSignedIn: boolean;
}

/**
 * Keeps <html lang>, the `dark` class and the theme cookie in line with the account after hydration and
 * on soft navigations. The head script already painted the cookie's theme; this corrects it when the
 * cookie is stale (changed in another browser, or a session that expired).
 */
export function DocumentPreferences({ locale, theme, isSignedIn }: DocumentPreferencesProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.classList.toggle("dark", theme === "dark");

    const wanted = isSignedIn ? theme : null;
    if (readThemeCookie(document.cookie) !== wanted) {
      document.cookie = themeCookieAssignment(wanted, { secure: location.protocol === "https:" });
    }
  }, [locale, theme, isSignedIn]);

  return null;
}
