import { z } from "zod";
import { businessIdSchema } from "../business-ids/business-id.schema";
import { versionSchema } from "../version.schema";
import { ID_IMMUTABLE_MESSAGE, nameSchema, NOTHING_TO_CHANGE_MESSAGE } from "./named-record-fields.schema";

/** The editable fields, before the "at least one" rule (Zod can't extend a refined object). */
const fields = z.object({
  id: z.never({ error: ID_IMMUTABLE_MESSAGE }).optional(),
  version: versionSchema,
  name: nameSchema.optional(),
  active: z.boolean().optional(),
});

/** Refuses a change of nothing, under the `changes` key so an API client sees why. */
function atLeastOneField({ name, active }: { name?: string; active?: boolean }, ctx: z.RefinementCtx) {
  if (name === undefined && active === undefined) {
    ctx.addIssue({ code: "custom", path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE });
  }
}

/**
 * `PATCH /api/tenants/{tenant}/{locations|customers|suppliers}/{id}`: a new name and/or active flag,
 * at the version the client loaded (API-029). The ID comes from the path; one in the body is refused
 * rather than silently ignored, so a client never believes it changed it.
 */
export const namedRecordUpdateBodySchema = fields.superRefine(atLeastOneField);

export type NamedRecordUpdateBody = z.infer<typeof namedRecordUpdateBodySchema>;

/** The update actions: the body plus the record's ID, bound by the page. */
export const namedRecordUpdateSchema = fields.extend({ recordId: businessIdSchema }).superRefine(atLeastOneField);

export type NamedRecordUpdateInput = z.infer<typeof namedRecordUpdateSchema>;
