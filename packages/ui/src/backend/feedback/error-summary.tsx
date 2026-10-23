"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Errors the page may open with, such as a bookmarked filter the server refused. An alert already in
 * the page when it loads is not announced by every screen reader, so the summary takes focus when it
 * mounts: the reader hears it without moving first. It leaves alone a field the reader already chose
 * (typing while the page hydrates). Fields point at it with `aria-describedby={id}`.
 */
export function ErrorSummary({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) summary.current?.focus();
  }, []);
  return (
    <div ref={summary} id={id} role="alert" tabIndex={-1} className={cn("outline-none", className)}>
      {children}
    </div>
  );
}
