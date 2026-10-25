/**
 * The time axis of the demand review (#240): days, ISO weeks (Monday to Sunday) or calendar months,
 * over a window around today. Dates are ISO calendar dates (`YYYY-MM-DD`) with no time zone, which
 * sort as text; every calculation runs on UTC days so no local clock shifts a bucket.
 */

export const DEMAND_BUCKETS = ["day", "week", "month"] as const;
export type DemandBucket = (typeof DEMAND_BUCKETS)[number];

/**
 * How many buckets the window shows before and after the current one (spec, Window): three weeks of
 * days, a quarter of weeks each way, and nine months back with six ahead, the planner's review range.
 */
export const DEMAND_WINDOWS: Record<DemandBucket, { back: number; ahead: number }> = {
  day: { back: 21, ahead: 21 },
  week: { back: 13, ahead: 13 },
  month: { back: 9, ahead: 6 },
};

/** How many windows Earlier and Later may move: `offset` runs from −20 to 20, in steps of `ahead` buckets. */
export const MAX_DEMAND_OFFSET = 20;

/** One bucket of a window: `start` inclusive, `end` exclusive. `todayFraction` (current bucket only) is where today starts in it, from 0 to 1. */
export interface DemandBucketFrame {
  start: string;
  end: string;
  past: boolean;
  current: boolean;
  todayFraction?: number;
}

/** The buckets a demand review shows, from `from` (inclusive) to `to` (exclusive). */
export interface DemandWindow {
  bucket: DemandBucket;
  today: string;
  from: string;
  to: string;
  buckets: DemandBucketFrame[];
}

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
/** ISO 8601: a week belongs to the year of its Thursday, three days after its Monday. */
const MONDAY_TO_THURSDAY = 3;

/** `date` as a count of UTC days since 1970-01-01. */
function dayNumber(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;
}

function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** `date` moved by `days`. */
export function addDays(date: string, days: number): string {
  return dateOf(dayNumber(date) + days);
}

/** The first day of `date`'s calendar month. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The first day of the month `months` after `date`'s month. */
export function addMonths(date: string, months: number): string {
  return dateOf(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + months, 1) / DAY_MS);
}

/** The Monday of `date`'s ISO week. */
function weekStart(date: string): string {
  const day = dayNumber(date);
  // 1970-01-01 was a Thursday, so day 0 is three days after a Monday.
  const sinceMonday = (((day + MONDAY_TO_THURSDAY) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return dateOf(day - sinceMonday);
}

/** `date`'s ISO week number and the ISO week-year it belongs to: 2026-12-31 is W53 of 2026, 2027-01-04 W1 of 2027. */
export function isoWeek(date: string): { year: number; week: number } {
  const thursday = addDays(weekStart(date), MONDAY_TO_THURSDAY);
  const year = Number(thursday.slice(0, 4));
  return { year, week: Math.floor((dayNumber(thursday) - dayNumber(`${year}-01-01`)) / DAYS_PER_WEEK) + 1 };
}

/** The first day of the bucket that contains `date`. */
export function bucketStart(bucket: DemandBucket, date: string): string {
  if (bucket === "day") return date;
  return bucket === "week" ? weekStart(date) : monthStart(date);
}

/** The start of the bucket `count` buckets after the one starting on `start`. */
function shift(bucket: DemandBucket, start: string, count: number): string {
  if (bucket === "month") return addMonths(start, count);
  return addDays(start, bucket === "week" ? count * DAYS_PER_WEEK : count);
}

/**
 * The window of `bucket`s around `today`: the current bucket, `back` before it and `ahead` after it,
 * moved by `offset × ahead` buckets (Earlier and Later). Whether a bucket is past or current always
 * follows the real `today`, wherever the window sits.
 */
export function demandWindow(bucket: DemandBucket, today: string, offset = 0): DemandWindow {
  const { back, ahead } = DEMAND_WINDOWS[bucket];
  const current = bucketStart(bucket, today);
  const first = shift(bucket, current, offset * ahead - back);
  const buckets = Array.from({ length: back + 1 + ahead }, (_, index): DemandBucketFrame => {
    const start = shift(bucket, first, index);
    const end = shift(bucket, first, index + 1);
    if (start !== current) return { start, end, past: start < current, current: false };
    const todayFraction = (dayNumber(today) - dayNumber(start)) / (dayNumber(end) - dayNumber(start));
    return { start, end, past: false, current: true, todayFraction };
  });
  return { bucket, today, from: buckets[0].start, to: buckets.at(-1)!.end, buckets };
}

/** The index of the window's bucket holding `date`, or `null` when `date` is outside the window. */
export function bucketIndex(window: DemandWindow, date: string): number | null {
  if (date < window.from || date >= window.to) return null;
  const start = bucketStart(window.bucket, date);
  if (window.bucket === "month") {
    const months = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
    return months(start) - months(window.from);
  }
  const days = dayNumber(start) - dayNumber(window.from);
  return window.bucket === "week" ? days / DAYS_PER_WEEK : days;
}
