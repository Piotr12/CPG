import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { versionSchema } from "../version.schema";
import { bomRecipeFormSchema } from "./bom-create.schema";
import {
  BOM_ID_IMMUTABLE_MESSAGE,
  BOM_OUTPUT_IMMUTABLE_MESSAGE,
  bomIdSchema,
  componentsSchema,
  prioritySchema,
  throughNotBeforeFrom,
  validThroughSchema,
} from "./bom-fields.schema";

/** What a body changing nothing is told; unknown keys are dropped, so a typo lands here too. */
export const NOTHING_TO_CHANGE_MESSAGE = "Send at least one of priority, validFrom, validThrough, components or active.";

/**
 * `PATCH /api/tenants/{tenant}/boms/{id}`: any recipe field and/or `active`, at the version the
 * client loaded (API-029, spec Q13). Absent recipe fields keep the current revision's values;
 * `components` is the complete new list; `validThrough: null` removes the end. The ID and the output
 * are refused rather than ignored, so a client never believes it changed them.
 */
export const bomUpdateBodySchema = z
  .object({
    id: z.never({ error: BOM_ID_IMMUTABLE_MESSAGE }).optional(),
    output: z.never({ error: BOM_OUTPUT_IMMUTABLE_MESSAGE }).optional(),
    version: versionSchema,
    priority: prioritySchema.optional(),
    validFrom: calendarDateSchema.optional(),
    validThrough: validThroughSchema.optional(),
    components: componentsSchema.optional(),
    active: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const { priority, validFrom, validThrough, components, active } = body;
    if ([priority, validFrom, validThrough, components, active].every((field) => field === undefined)) {
      ctx.addIssue({ code: "custom", path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE });
    }
    throughNotBeforeFrom(body, ctx);
  });

export type BomUpdateBody = z.infer<typeof bomUpdateBodySchema>;

/** The Edit recipe form's `updateBomRecipe` action: the whole recipe, plus the BOM and version the page bound. */
export const bomRecipeUpdateSchema = bomRecipeFormSchema.safeExtend({ bomId: bomIdSchema, version: versionSchema });

/** The Deactivate / Reactivate action: the BOM, the version the page loaded, and the new flag. */
export const bomActiveSchema = z.object({ bomId: bomIdSchema, version: versionSchema, active: z.boolean() });
