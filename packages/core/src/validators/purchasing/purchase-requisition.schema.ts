import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { versionSchema } from "../version.schema";
import { REQUISITION_IMMUTABLE_MESSAGE } from "./purchasing-fields.schema";

/**
 * `POST /api/tenants/{tenant}/purchase-requisitions`, and the Create requisition form (spec Q3): the
 * material and location by business ID, a quantity as a decimal string in any unit the material
 * converts, and the date it is needed.
 */
export const requisitionCreateSchema = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  quantity: enteredQuantitySchema,
  unit: unitSchema,
  requiredDate: calendarDateSchema,
});

export type RequisitionCreateInput = z.infer<typeof requisitionCreateSchema>;

/**
 * `PATCH /api/tenants/{tenant}/purchase-requisitions/{id}` (spec Q8): the new required date, at the
 * version the client loaded. Anything else is refused rather than ignored, so a client never
 * believes it changed it.
 */
export const requisitionUpdateBodySchema = z.object({
  version: versionSchema,
  requiredDate: calendarDateSchema,
  material: z.never({ error: REQUISITION_IMMUTABLE_MESSAGE }).optional(),
  location: z.never({ error: REQUISITION_IMMUTABLE_MESSAGE }).optional(),
  quantity: z.never({ error: REQUISITION_IMMUTABLE_MESSAGE }).optional(),
  unit: z.never({ error: REQUISITION_IMMUTABLE_MESSAGE }).optional(),
});

/**
 * The requisition list's Change date form (spec 2026-10-21--2036UTC-purchasing-date-edits): only the
 * new required date. The action supplies the version the dialog opened with.
 */
export const requisitionDateSchema = requisitionUpdateBodySchema.pick({ requiredDate: true });
