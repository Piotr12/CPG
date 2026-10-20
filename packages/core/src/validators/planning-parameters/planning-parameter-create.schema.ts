import { z } from "zod";
import { positiveQuantitySchema, quantitySchema } from "../quantities/quantity.schema";
import {
  leadTimeDaysSchema,
  leadTimeDaysTextSchema,
  locationReferenceSchema,
  materialReferenceSchema,
  procurementSchema,
} from "./planning-parameter-fields.schema";

/**
 * `POST /api/tenants/{tenant}/planning-parameters`: one material's parameter set at one location, all
 * four values required (spec Q3). Quantities are base-unit decimal strings; the lead time is a JSON
 * integer of whole days (MAT-016, MAT-018). Make for a raw material is the service's check, which
 * knows the material's type.
 */
export const planningParameterCreateSchema = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  procurement: procurementSchema,
  leadTimeDays: leadTimeDaysSchema,
  minimumQuantity: quantitySchema,
  lotMultiple: positiveQuantitySchema,
});

export type PlanningParameterCreateInput = z.infer<typeof planningParameterCreateSchema>;

/** The Add parameters form and its action: the same set, with the lead time typed as text. */
export const planningParameterCreateFormSchema = planningParameterCreateSchema.extend({
  leadTimeDays: leadTimeDaysTextSchema,
});
