import { formatDecimal, isoWeek, parseDecimal, type DemandBucketFrame, type DemandFiguresView, type DemandReviewView } from "@cpg/core";
import { formatFigure, type StackedColumnBucket } from "@cpg/ui/backend/charts/stacked-column-chart";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";

type Labels = Messages["demandReview"];

/** A six-decimal figure as micro-units: every sum the screen shows is exact (R03). */
const micro = (text: string) => parseDecimal(text)!;

/** Micro-units as the screen shows them: up to one decimal under 100, none from 100 up, zero as "–". */
export function shown(value: bigint, locale: string): string {
  return formatFigure(plotted(value), locale);
}

/** Micro-units as a chart coordinate: only drawn, never added up again. */
function plotted(value: bigint): number {
  return Number(formatDecimal(value));
}

const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

/** What a bucket shows in one figure: shipped for the past, still to ship ahead, both in today's bucket. */
export function cellOf(bucket: DemandBucketFrame, figures: DemandFiguresView): bigint {
  const shipped = bucket.past || bucket.current ? micro(figures.shipped) : 0n;
  const toShip = bucket.past ? 0n : micro(figures.open) + micro(figures.forecast);
  return shipped + toShip;
}

const UTC = { timeZone: "UTC" } as const;
const dateOf = (start: string) => new Date(`${start}T00:00:00Z`);

/**
 * Each bucket's axis label and tooltip heading in the reader's locale: "26 Oct" and "Mon 26 Oct" for
 * days, "W44" and "W44 · 26 Oct" for ISO weeks, "Nov" (with the year on the first month and on
 * January) and "November 2026" for months.
 */
export function bucketLabels(view: Pick<DemandReviewView, "bucket" | "buckets">, locale: string, labels: Labels): { label: string; title: string }[] {
  const dayMonth = new Intl.DateTimeFormat(locale, { ...UTC, day: "numeric", month: "short" });
  return view.buckets.map(({ start }, index) => {
    const date = dateOf(start);
    if (view.bucket === "day") {
      return { label: dayMonth.format(date), title: new Intl.DateTimeFormat(locale, { ...UTC, weekday: "short", day: "numeric", month: "short" }).format(date) };
    }
    if (view.bucket === "week") {
      const week = String(isoWeek(start).week);
      return { label: fill(labels.weekLabel, { week }), title: fill(labels.weekTitle, { week, date: dayMonth.format(date) }) };
    }
    const withYear = index === 0 || start.slice(5, 7) === "01";
    return {
      label: new Intl.DateTimeFormat(locale, { ...UTC, month: "short", ...(withYear && { year: "numeric" }) }).format(date),
      title: new Intl.DateTimeFormat(locale, { ...UTC, month: "long", year: "numeric" }).format(date),
    };
  });
}

/**
 * The chart's columns: shipped in past buckets and today's, then open orders and forecast not yet
 * ordered from today on; the Ordered line over the past and today; an overdue marker on today's.
 */
export function chartBuckets(view: DemandReviewView, locale: string, labels: Labels): StackedColumnBucket[] {
  const names = bucketLabels(view, locale, labels);
  return view.buckets.map((bucket, index) => {
    const figures = view.total[index];
    const overdue = micro(figures.overdue);
    return {
      key: bucket.start,
      ...names[index],
      past: bucket.past,
      current: bucket.current,
      segments: [
        bucket.past || bucket.current ? plotted(micro(figures.shipped)) : 0,
        bucket.past ? 0 : plotted(micro(figures.open)),
        bucket.past ? 0 : plotted(micro(figures.forecast)),
      ],
      ...(!bucket.past && !bucket.current ? {} : { line: plotted(micro(figures.ordered)) }),
      ...(bucket.current && overdue > 0n && { marker: fill(labels.overdue, { quantity: shown(overdue, locale) }) }),
    };
  });
}

/**
 * The chart's header figures: still to ship from today's bucket on, and shipped in the past buckets
 * ("last 13 weeks"), or in every bucket of a window Earlier or Later moved ("in this window").
 */
export function headline(view: DemandReviewView, locale: string): { shipped: string; toShip: string } {
  const counted = (bucket: DemandBucketFrame) => bucket.past || (view.offset !== 0 && bucket.current);
  const past = view.buckets.map((bucket, index) => (counted(bucket) ? micro(view.total[index].shipped) : 0n));
  const ahead = view.buckets.map((bucket, index) => (bucket.past ? 0n : micro(view.total[index].open) + micro(view.total[index].forecast)));
  return { shipped: shown(sum(past), locale), toShip: shown(sum(ahead), locale) };
}

/** One grid row, as display texts: its cells and their total, and the three detail lines with theirs. */
export interface GridLine {
  key: string;
  name: string;
  cells: string[];
  total: string;
  details: { figure: "open" | "overdue" | "forecast"; cells: string[]; total: string }[];
}

/** A grid row of `figures` (one per bucket), its Total adding the cells shown. */
export function gridLine(view: Pick<DemandReviewView, "buckets">, key: string, name: string, figures: DemandFiguresView[], locale: string): GridLine {
  const cells = view.buckets.map((bucket, index) => cellOf(bucket, figures[index]));
  const detail = (figure: "open" | "overdue" | "forecast") => {
    const values = figures.map((bucket) => micro(bucket[figure]));
    return { figure, cells: values.map((value) => shown(value, locale)), total: shown(sum(values), locale) };
  };
  return {
    key,
    name,
    cells: cells.map((value) => shown(value, locale)),
    total: shown(sum(cells), locale),
    details: [detail("open"), detail("overdue"), detail("forecast")],
  };
}
