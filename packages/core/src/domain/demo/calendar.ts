/*
 * Calendar arithmetic for the demonstration dataset, in UTC. Dates are ISO `YYYY-MM-DD` text, which
 * sorts and compares as plain strings; a month is one whole number, so months add and subtract like
 * integers. "Weekdays" are Monday to Friday; demand falls on them, and weeks start on Monday (ISO 8601).
 */

/** A calendar month as a count of months since January of year 0: `year × 12 + (month − 1)`. */
export type Month = number;

const MONTHS_PER_YEAR = 12;
const SATURDAY = 6;
const SUNDAY = 0;
const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;

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

/** The number of days from 1970-01-01 to a date: the key a date's random draws and day counts use. */
export function dayNumber(date: string): number {
  return utc(date).getTime() / DAY_MS;
}

/** The ISO weekday of a date: 1 for Monday to 7 for Sunday. */
export function isoWeekday(date: string): number {
  return utc(date).getUTCDay() || DAYS_PER_WEEK;
}

/** The Monday of a date's ISO week: the week's key. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** The last day of a month. */
export function monthEnd(month: Month): string {
  return addDays(monthStart(month + 1), -1);
}

/** The number of days in a month. */
export function daysInMonth(month: Month): number {
  return Number(monthEnd(month).slice(8, 10));
}

/** The date `months` calendar months after `date`, on the same day of the month or the month's last day when it is shorter. */
export function addMonths(date: string, months: number): string {
  const month = monthOf(date) + months;
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(month));
  return `${monthStart(month).slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** Every weekday from `first` to `last`, both included when they are weekdays, in order. */
export function weekdaysFrom(first: string, last: string): string[] {
  const weekdays: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (isWeekday(date)) weekdays.push(date);
  }
  return weekdays;
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
