import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { StatusTone } from "./status-badge";

/** Complete class strings per tone (Tailwind only generates classes it finds whole in the source). */
export const CALLOUT_TONES: Record<StatusTone, { box: string; icon: string; defaultIcon: LucideIcon }> = {
  neutral: { box: "bg-neutral-surface border-neutral-edge", icon: "text-neutral-tone", defaultIcon: Info },
  success: { box: "bg-success-surface border-success-edge", icon: "text-success", defaultIcon: CircleCheck },
  warning: { box: "bg-warning-surface border-warning-edge", icon: "text-warning", defaultIcon: TriangleAlert },
  danger: { box: "bg-danger-surface border-danger-edge", icon: "text-danger", defaultIcon: OctagonAlert },
};

export interface CalloutProps {
  tone: StatusTone;
  title?: ReactNode;
  /**
   * `note` (the default) for a standing message, `status` for the result of an async action, and
   * `alert` only when the message blocks the next step.
   */
  role?: "note" | "status" | "alert";
  /** Replaces the tone's default icon. */
  icon?: LucideIcon;
  /** Next steps (buttons or links), under the body. */
  actions?: ReactNode;
  children: ReactNode;
}

/** A message in a tone: icon, optional title, body and actions. A message, not a container. */
export function Callout({ tone, title, role = "note", icon, actions, children }: CalloutProps) {
  const style = CALLOUT_TONES[tone];
  const Icon = icon ?? style.defaultIcon;
  return (
    <div data-slot="callout" data-tone={tone} role={role} className={cn("flex gap-2 rounded-md border p-4", style.box)}>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", style.icon)} />
      <div className="flex min-w-0 flex-col gap-2">
        {title && <p className="text-sm font-medium text-foreground">{title}</p>}
        <div className="max-w-prose text-sm text-foreground">{children}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
