import type { ReactNode } from "react";

/** What a section shows while its data loads, `<Suspense>` fallbacks included. */
export function LoadingMessage({ children = "Loading…" }: { children?: ReactNode }) {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}
