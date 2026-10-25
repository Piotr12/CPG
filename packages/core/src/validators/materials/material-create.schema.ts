import { z } from "zod";
import { isStatisticalUnit, registeredUnitSchema, STATISTICAL_BASE_UNIT_MESSAGE } from "../units/unit-registry";
import { descriptionSchema, materialTypeSchema, unitSchema } from "./material-fields.schema";

/**
 * A new material (MAT-005…008): the Create material form, the `createMaterial` action and
 * `POST /api/tenants/{tenant}/materials` share it. There is no ID: the server assigns it (R01).
 */
export const materialCreateSchema = z.object({
  type: materialTypeSchema,
  description: descriptionSchema,
  // A new material's unit comes from the registry (#217), and is never the report-only SU (#239).
  baseUnit: registeredUnitSchema.refine((unit) => !isStatisticalUnit(unit), STATISTICAL_BASE_UNIT_MESSAGE),
});

export type MaterialCreateInput = z.infer<typeof materialCreateSchema>;

/**
 * The Edit material form's check: the same fields, but the base unit only well formed, so a material
 * keeps a unit stored before the registry; the service refuses a *changed* unit outside it (#217).
 */
export const materialEditFormSchema = materialCreateSchema.extend({ baseUnit: unitSchema });
