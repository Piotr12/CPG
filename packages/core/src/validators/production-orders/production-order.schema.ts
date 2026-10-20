import { z } from "zod";
import { businessIdSchema } from "../business-ids/business-id.schema";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { positiveQuantitySchema } from "../quantities/quantity.schema";
import { versionSchema } from "../version.schema";

export const PRODUCTION_PAGE_SIZE = 100;
export const productionOrderListSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) });
export const productionOrderOptionsSchema = z.strictObject({
  output: businessIdSchema,
  location: businessIdSchema,
  quantity: positiveQuantitySchema,
  unit: unitSchema,
  plannedFinish: calendarDateSchema,
});
export const productionOrderCreateSchema = productionOrderOptionsSchema.extend({
  bom: businessIdSchema.optional(),
  revision: z.number().int().positive().optional(),
}).refine(({ bom, revision }) => (bom === undefined) === (revision === undefined), { path: ["bom"], error: "Choose both a BOM and its revision." });
export const productionOrderUpdateSchema = z.strictObject({
  version: versionSchema,
  quantity: positiveQuantitySchema.optional(),
  unit: unitSchema.optional(),
  plannedFinish: calendarDateSchema.optional(),
});
export const productionOrderUpdateActionSchema = productionOrderUpdateSchema.extend({ orderId: businessIdSchema });
export type ProductionOptionsInput = z.infer<typeof productionOrderOptionsSchema>;
export type ProductionOrderInput = z.infer<typeof productionOrderCreateSchema>;
export type ProductionOrderChanges = Omit<z.infer<typeof productionOrderUpdateSchema>, "version">;
