import type { Locale, MrpShortageView } from "@cpg/core";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { localeQuantity } from "../forms/form-labels";
import { shortDate } from "./mrp-marks";

type ShortageLabels = Messages["mrp"]["report"]["shortages"];

/**
 * A shortage's text (#380, spec Q6): the requirement, by kind, with its priority date, and how much of it is uncovered,
 * e.g. "Customer order 00000012, line 1 · due Nov 7 · 8 kg short of 10 kg". A planned component names its parent and its
 * root's priority. The date drops its year unless it differs from the day's (`shortDate`).
 */
export function shortageText(shortage: MrpShortageView, unit: string, locale: Locale, t: ShortageLabels): string {
  const date = shortDate(shortage.originalDate, shortage.date, locale);
  const root = shortage.root ? fill(t.roots[shortage.root.kind], { date }) : "";
  // An order line is numbered from 1, as the order screens number it ("Line 1"); the API keeps its stored position, from 0.
  const line = shortage.position === null ? "" : String(shortage.position + 1);
  const requirement = fill(t.kinds[shortage.kind], { document: shortage.document ?? "", line, date, root });
  const amount = (quantity: string) => `${localeQuantity(quantity, locale)} ${unit}`;
  return fill(t.line, { requirement, uncovered: amount(shortage.uncovered), required: amount(shortage.required) });
}

/**
 * A plan's short requirements grouped by their day, in one pass, each day's entries kept in the order given (#391): the
 * Day view looks each of its 90 days up here instead of scanning the whole list once per day.
 */
export function shortagesByDate(shortages: readonly MrpShortageView[]): ReadonlyMap<string, readonly MrpShortageView[]> {
  const days = new Map<string, MrpShortageView[]>();
  for (const shortage of shortages) {
    const day = days.get(shortage.date);
    if (day) day.push(shortage);
    else days.set(shortage.date, [shortage]);
  }
  return days;
}

/**
 * A day's short requirements (#380, spec Q5): an ordered list in the order MRP serves them, one line each, as text, so
 * no colour carries the meaning. Nothing on a day with none.
 */
export function MrpShortages({ shortages, unit, locale, labels }: { shortages: readonly MrpShortageView[]; unit: string; locale: Locale; labels: ShortageLabels }) {
  if (shortages.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1 text-sm" data-mrp-shortages>
      {shortages.map((shortage, index) => (
        <li key={index} data-mrp-shortage={shortage.kind}>{shortageText(shortage, unit, locale, labels)}</li>
      ))}
    </ol>
  );
}
