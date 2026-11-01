import { CalendarClock, CalendarX, ClockAlert, Truck, type LucideIcon } from "lucide-react";
import type { Locale, MrpMarkView } from "@cpg/core";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { plural } from "@cpg/ui/lib/plural";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { localeQuantity } from "../forms/form-labels";

type MarkLabels = Messages["mrp"]["report"]["marks"];

const ICONS: Record<MrpMarkView["kind"], LucideIcon> = {
  "overdue-supply": ClockAlert,
  "overdue-transfer": Truck,
  "late-supply": CalendarClock,
  "beyond-horizon": CalendarX,
};

/** `date` as a short day and month in the reader's language, with its year when it isn't `near`'s. */
export function shortDate(date: string, near: string, locale: Locale): string {
  const withYear = date.slice(0, 4) !== near.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short", ...(withYear && { year: "numeric" }) }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * A mark's text (E18-S02, UX-018): what it warns of, its document, its own or finish date, and the
 * quantity in the base unit, e.g. "Overdue · PO 00000003/1 · due 28 Sep · 30 KG".
 */
export function markText(mark: MrpMarkView, unit: string, locale: Locale, t: MarkLabels): string {
  const quantity = `${localeQuantity(mark.quantity, locale)} ${unit}`;
  switch (mark.kind) {
    case "overdue-supply": {
      const document = fill(t.documents[mark.source], { id: mark.document, position: String(mark.position ?? "") });
      return fill(t.overdueSupply, { document, date: shortDate(mark.plannedDate, mark.date, locale), quantity });
    }
    case "overdue-transfer":
      return fill(t.overdueTransfer, { transfer: mark.transfer, date: shortDate(mark.plannedDate, mark.date, locale), quantity });
    case "late-supply":
      return fill(t.lateSupply, { days: plural(locale, mark.lateDays, t.days), date: shortDate(mark.plannedFinish, mark.date, locale), quantity });
    case "beyond-horizon":
      return fill(t.beyondHorizon, { date: shortDate(mark.plannedFinish, mark.date, locale), quantity });
  }
}

/**
 * A day's, a week's or a proposal's marks: one warning badge each, icon and text, never colour alone
 * (design system v1), stacked in their order.
 */
export function MrpMarks({ marks, unit, locale, labels }: { marks: readonly MrpMarkView[]; unit: string; locale: Locale; labels: MarkLabels }) {
  if (marks.length === 0) return null;
  return (
    <div className="flex flex-col items-start gap-1" data-mrp-marks>
      {marks.map((mark, index) => (
        <span key={index} data-mrp-mark={mark.kind}>
          <StatusBadge tone="warning" icon={ICONS[mark.kind]}>{markText(mark, unit, locale, labels)}</StatusBadge>
        </span>
      ))}
    </div>
  );
}
