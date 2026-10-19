import type { ReactNode } from "react";

/** An error the user should read now: announced by screen readers as soon as it appears. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
