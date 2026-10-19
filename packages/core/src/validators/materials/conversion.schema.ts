import { z } from "zod";
import { versionSchema } from "../version.schema";
import { factorSchema, materialIdSchema, unitSchema } from "./material-fields.schema";

/**
 * A new conversion, `1 unit = numerator / denominator` base units (spec Q3): the Add conversion form
 * and `POST …/materials/{id}/conversions` share it. A zero denominator fails here (MAT-022).
 */
export const conversionCreateSchema = z.object({
  unit: unitSchema,
  numerator: factorSchema,
  denominator: factorSchema,
});

export type ConversionCreateInput = z.infer<typeof conversionCreateSchema>;

/** `PATCH …/conversions/{unit}`: a new factor at the version the client loaded. */
export const conversionChangeBodySchema = z.object({
  numerator: factorSchema,
  denominator: factorSchema,
  version: versionSchema,
});

/** `DELETE …/conversions/{unit}`: the version the client loaded. */
export const conversionRemoveBodySchema = z.object({ version: versionSchema });

/** The Change factor form's own fields: the unit and version come from the row. */
export const conversionFactorFormSchema = conversionChangeBodySchema.omit({ version: true });

/** The conversion actions: the bodies plus the material (and the unit), bound by the page. */
export const conversionAddSchema = conversionCreateSchema.extend({ materialId: materialIdSchema });
export const conversionChangeSchema = conversionChangeBodySchema.extend({ materialId: materialIdSchema, unit: unitSchema });
export const conversionRemoveSchema = conversionRemoveBodySchema.extend({ materialId: materialIdSchema, unit: unitSchema });
