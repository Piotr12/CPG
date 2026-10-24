"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";

/** Between `md` and `lg` the sidebar starts as the icon rail; from `lg` it starts expanded (design system D6). */
export const RAIL_QUERY = "(min-width: 768px) and (max-width: 1023px)";
export const WIDE_QUERY = "(min-width: 1024px)";

/** Below 768 px the sidebar is a drawer, whose own state this leaves alone. */
export type ViewportBand = "drawer" | "rail" | "wide";

function subscribe(onChange: () => void) {
  const queries = [RAIL_QUERY, WIDE_QUERY].map((query) => window.matchMedia(query));
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

const band = (): ViewportBand => (window.matchMedia(RAIL_QUERY).matches ? "rail" : window.matchMedia(WIDE_QUERY).matches ? "wide" : "drawer");
/** The server and the hydrating render don't know the width: nothing is applied until the client does. */
const unknown = () => null;

/**
 * Folds the desktop sidebar to the rail between `md` and `lg` and expands it from `lg`, on load and
 * whenever the viewport crosses a band, until the account toggles it themselves in this page session.
 * Never persisted (sidebar spec Q8): the next full load starts from the width again.
 */
export function useRailByDefault(open: boolean, setOpen: (open: boolean) => void) {
  const current = useSyncExternalStore(subscribe, band, unknown);
  const applied = useRef<boolean | null>(null);
  const toggled = useRef(false);

  // A change this hook didn't make is the account's own choice, and it wins from then on.
  useEffect(() => {
    if (applied.current !== null && open !== applied.current) toggled.current = true;
  }, [open]);

  const apply = useEffectEvent((next: ViewportBand | null) => {
    if (next === null || next === "drawer" || toggled.current) return;
    applied.current = next === "wide";
    setOpen(applied.current);
  });
  useEffect(() => apply(current), [current]);
}
