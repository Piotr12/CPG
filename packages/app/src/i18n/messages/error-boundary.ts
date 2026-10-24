import type { Locale } from "@cpg/core";

export interface ErrorBoundaryText {
  title: string;
  /** `{digest}` is the error's reference, which the server log carries too. */
  description: string;
  retry: string;
}

/**
 * The unexpected-error page's text in both languages, on its own: the error boundaries are client
 * components that can't call `getMessages()` and must not pull the whole dictionary into the browser.
 * The dictionaries reference it as `unexpectedError`, so the keys exist in both and are written once.
 * Typed rather than `as const`, which would make `pl.ts` match the English literals.
 */
export const ERROR_BOUNDARY: Record<Locale, ErrorBoundaryText> = {
  en: {
    title: "Something went wrong on our side.",
    description: "Try again; if it keeps happening, tell your administrator and quote reference {digest}.",
    retry: "Try again",
  },
  pl: {
    title: "Coś poszło nie tak po naszej stronie.",
    description: "Spróbuj ponownie; jeśli błąd się powtarza, powiedz o tym administratorowi i podaj identyfikator {digest}.",
    retry: "Spróbuj ponownie",
  },
};
