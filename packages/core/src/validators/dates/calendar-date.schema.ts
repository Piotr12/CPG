import { z } from "zod";

/** The English message; screens translate it by matching this constant. */
export const CALENDAR_DATE_MESSAGE = "Enter a real date written YYYY-MM-DD.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `text` is a real calendar date written `YYYY-MM-DD`: `2026-02-30` and `2026-2-1` are not.
 * The date is read at UTC midnight and must come back unchanged, which rejects impossible days.
 */
export function isCalendarDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** A calendar date with no time or time zone, as an ISO string (a safety target's effective date). */
export const calendarDateSchema = z
  .string({ error: CALENDAR_DATE_MESSAGE })
  .trim()
  .refine(isCalendarDate, CALENDAR_DATE_MESSAGE);
