import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { badgeVariants } from "../../components/badge";
import { cn } from "../../lib/utils";

/** The four state tones (decision D4: no `info`; resting states such as Open are `neutral`). */
export type StatusTone = "success" | "warning" | "danger" | "neutral";

/** Complete class strings per tone: Tailwind only generates classes it finds whole in the source. */
export const STATUS_BADGE_TONES: Record<StatusTone, string> = {
  success: "bg-success-surface text-success border-success-edge",
  warning: "bg-warning-surface text-warning border-warning-edge",
  danger: "bg-danger-surface text-danger border-danger-edge",
  neutral: "bg-neutral-surface text-neutral-tone border-neutral-edge",
};

export interface StatusBadgeProps {
  tone: StatusTone;
  icon: LucideIcon;
  /** A dashed edge, for a state that is switched off rather than finished (Inactive). */
  dashed?: boolean;
  /** The label, always visible: the tone and icon only reinforce it. */
  children: ReactNode;
}

/**
 * A record's state as icon + label + tone (Principle 3), never colour alone. It shares the `Badge`'s
 * geometry (20 px, `rounded-sm`, `px-1.5`, `text-xs font-medium`, 14 px icon) without a variant's colours.
 */
export function StatusBadge({ tone, icon: Icon, dashed = false, children }: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        badgeVariants({ variant: null }),
        STATUS_BADGE_TONES[tone],
        dashed && "border-dashed",
      )}
    >
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}
