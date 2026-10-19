import { z } from "zod";
import { descriptionSchema, materialTypeSchema, unitSchema } from "./material-fields.schema";

/**
 * A new material (MAT-005…008): the Create material form, the `createMaterial` action and
 * `POST /api/tenants/{tenant}/materials` share it. There is no ID: the server assigns it (R01).
 */
export const materialCreateSchema = z.object({
  type: materialTypeSchema,
  description: descriptionSchema,
  baseUnit: unitSchema,
});

export type MaterialCreateInput = z.infer<typeof materialCreateSchema>;
