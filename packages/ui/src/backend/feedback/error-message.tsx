import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** An error the user should read now, as icon + text: announced by screen readers as soon as it appears. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2 rounded-md border border-danger-edge bg-danger-surface p-3 text-sm text-danger">
      {/* A line-high box keeps the icon on the first line when the message wraps. */}
      <span className="flex h-5 shrink-0 items-center">
        <CircleAlert aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
