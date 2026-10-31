import { z } from "zod";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { optionalFilter } from "./optional-filter";

/** How many rows one page of the stock report holds, as many as a page of the other lists. */
export const STOCK_REPORT_PAGE_SIZE = 100;

/**
 * `GET /api/tenants/{tenant}/reports/stock` and the Stock report page (spec Q3, Q4): an optional
 * material and location, whether rows that are all zero are shown, and the page. Another parameter
 * is refused, so a misspelt filter never silently shows everything.
 */
export const stockReportQuerySchema = z.strictObject({
  material: optionalFilter(materialReferenceSchema),
  location: optionalFilter(locationReferenceSchema),
  includeZero: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

export type StockReportQuery = z.output<typeof stockReportQuerySchema>;
