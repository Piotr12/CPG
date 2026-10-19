import { z } from "zod";
import { versionSchema } from "../version.schema";
import {
  descriptionSchema,
  MATERIAL_ID_IMMUTABLE_MESSAGE,
  materialIdSchema,
  materialTypeSchema,
  unitSchema,
} from "./material-fields.schema";

/**
 * `PATCH /api/tenants/{tenant}/materials/{id}`: any of the editable fields, at the version the
 * client loaded (API-029). The ID comes from the path; one in the body is refused rather than
 * silently ignored, so a client never believes it renamed a material (MAT-004).
 */
export const materialUpdateBodySchema = z.object({
  id: z.never({ error: MATERIAL_ID_IMMUTABLE_MESSAGE }).optional(),
  version: versionSchema,
  description: descriptionSchema.optional(),
  type: materialTypeSchema.optional(),
  baseUnit: unitSchema.optional(),
  active: z.boolean().optional(),
});

export type MaterialUpdateBody = z.infer<typeof materialUpdateBodySchema>;

/** The `updateMaterial` action: the body plus the material, bound by the page. */
export const materialUpdateSchema = materialUpdateBodySchema.extend({ materialId: materialIdSchema });

export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
