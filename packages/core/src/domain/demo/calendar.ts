/*
 * Calendar arithmetic for the demonstration dataset, in UTC. Dates are ISO `YYYY-MM-DD` text, which
 * sorts and compares as plain strings; a month is one whole number, so months add and subtract like
 * integers. "Weekdays" are Monday to Friday, numbered from 1 within their month (spec "Demand").
 */

/** A calendar month as a count of months since January of year 0: `year × 12 + (month − 1)`. */
export type Month = number;

const MONTHS_PER_YEAR = 12;
const SATURDAY = 6;
const SUNDAY = 0;

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The month a date falls in. */
export function monthOf(date: string): Month {
  return Number(date.slice(0, 4)) * MONTHS_PER_YEAR + Number(date.slice(5, 7)) - 1;
}

/** The calendar year of a month. */
export function yearOf(month: Month): number {
  return Math.floor(month / MONTHS_PER_YEAR);
}

/** The month's position in its year, 0 for January: the index into a seasonality profile. */
export function monthOfYear(month: Month): number {
  return month % MONTHS_PER_YEAR;
}

/** A month as `YYYY-MM`. */
export function monthLabel(month: Month): string {
  return `${String(yearOf(month)).padStart(4, "0")}-${String(monthOfYear(month) + 1).padStart(2, "0")}`;
}

/** The first day of a month. */
export function monthStart(month: Month): string {
  return `${monthLabel(month)}-01`;
}

/** The date `days` calendar days after `date` (before it when negative). */
export function addDays(date: string, days: number): string {
  const moved = utc(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return isoDate(moved);
}

/** Whether a date is Monday to Friday. */
export function isWeekday(date: string): boolean {
  const day = utc(date).getUTCDay();
  return day !== SATURDAY && day !== SUNDAY;
}

/** Each month's weekdays once worked out: the generator asks for them thousands of times. */
const WEEKDAYS = new Map<Month, readonly string[]>();

/** The weekdays of a month, in order: every month has at least 20. */
export function weekdaysOf(month: Month): readonly string[] {
  const known = WEEKDAYS.get(month);
  if (known) return known;
  const weekdays: string[] = [];
  for (let date = monthStart(month); monthOf(date) === month; date = addDays(date, 1)) {
    if (isWeekday(date)) weekdays.push(date);
  }
  WEEKDAYS.set(month, weekdays);
  return weekdays;
}

/** The `n`-th weekday of a month, counting from 1; refused past the month's last weekday. */
export function nthWeekday(month: Month, n: number): string {
  const date = weekdaysOf(month)[n - 1];
  if (date === undefined) throw new RangeError(`${monthLabel(month)} has no weekday ${n}.`);
  return date;
}

/** The last weekday of a month. */
export function lastWeekday(month: Month): string {
  return weekdaysOf(month).at(-1)!;
}

/**
 * The date `count` weekdays after `date` (before it when negative), skipping Saturdays and Sundays:
 * two weekdays before a Monday is the Thursday before it.
 */
export function addWeekdays(date: string, count: number): string {
  const step = Math.sign(count);
  let moved = date;
  for (let left = Math.abs(count); left > 0; ) {
    moved = addDays(moved, step);
    if (isWeekday(moved)) left -= 1;
  }
  return moved;
}
