import { z } from "zod";
import { versionSchema } from "../version.schema";
import {
  descriptionSchema,
  MATERIAL_ID_IMMUTABLE_MESSAGE,
  materialIdSchema,
  materialTypeSchema,
  unitSchema,
} from "./material-fields.schema";

/** What a body changing nothing is told; unknown keys are dropped, so a typo lands here too. */
export const NOTHING_TO_CHANGE_MESSAGE = "Send at least one of description, type, baseUnit or active.";

/** The editable fields, before the "at least one" rule (Zod can't extend a refined object). */
const fields = z.object({
  id: z.never({ error: MATERIAL_ID_IMMUTABLE_MESSAGE }).optional(),
  version: versionSchema,
  description: descriptionSchema.optional(),
  type: materialTypeSchema.optional(),
  baseUnit: unitSchema.optional(),
  active: z.boolean().optional(),
});

/** Refuses a change of nothing, under the `changes` key so an API client sees why. */
function atLeastOneField(value: { description?: string; type?: string; baseUnit?: string; active?: boolean }, ctx: z.RefinementCtx) {
  const { description, type, baseUnit, active } = value;
  if ([description, type, baseUnit, active].every((field) => field === undefined)) {
    ctx.addIssue({ code: "custom", path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE });
  }
}

/**
 * `PATCH /api/tenants/{tenant}/materials/{id}`: at least one of the editable fields, at the version
 * the client loaded (API-029). The ID comes from the path; one in the body is refused rather than
 * silently ignored, so a client never believes it renamed a material (MAT-004).
 */
export const materialUpdateBodySchema = fields.superRefine(atLeastOneField);

export type MaterialUpdateBody = z.infer<typeof materialUpdateBodySchema>;

/** The `updateMaterial` action: the body plus the material, bound by the page. */
export const materialUpdateSchema = fields.extend({ materialId: materialIdSchema }).superRefine(atLeastOneField);

export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;
