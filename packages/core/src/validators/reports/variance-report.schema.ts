import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { optionalFilter } from "./optional-filter";

/** How many orders one page of the variance report holds: each row carries a table of its components (spec Q7). */
export const VARIANCE_REPORT_PAGE_SIZE = 50;

/**
 * The four document states an order can be in (#90), as `DocumentState` in `@cpg/db` lists them. Kept here
 * because client components import this schema, and `@cpg/db` must stay out of the browser bundle.
 */
export const ORDER_STATES = ["open", "completed", "closed-early", "cancelled"] as const;

/** The English message; screens translate it by matching this constant. */
export const VARIANCE_RANGE_MESSAGE = "The end date must not be before the start date.";

/** Each of the report's query parameters on its own, before the range check: what the page's form shows again. */
export const varianceReportFieldsSchema = z.strictObject({
  material: optionalFilter(materialReferenceSchema),
  location: optionalFilter(locationReferenceSchema),
  status: optionalFilter(z.enum(ORDER_STATES)),
  from: optionalFilter(calendarDateSchema),
  to: optionalFilter(calendarDateSchema),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

/**
 * `GET /api/tenants/{tenant}/reports/variance` and the Variance report page (spec Q6, Q7): an optional
 * material, location, order state and inclusive posting-date range, and the page. Another parameter
 * is refused, so a misspelt filter never silently shows everything; so is a range that ends before it starts.
 */
export const varianceReportQuerySchema = varianceReportFieldsSchema.superRefine(({ from, to }, ctx) => {
  if (from !== undefined && to !== undefined && to < from) ctx.addIssue({ code: "custom", path: ["to"], message: VARIANCE_RANGE_MESSAGE });
});

export type VarianceReportQuery = z.output<typeof varianceReportQuerySchema>;
