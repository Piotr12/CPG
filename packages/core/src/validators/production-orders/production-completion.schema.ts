import { z } from "zod";
import { BOM_COMPONENTS_MAX } from "../../domain/boms/recipe-rules";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { businessIdSchema } from "../business-ids/business-id.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import { pageSchema } from "../shipments/shipment.schema";
import { stockReversalSchema } from "../stock/stock-reversal.schema";

/** The English messages; screens translate them by matching these constants. */
export const COMPLETION_LINE_COUNT_MESSAGE = `Enter at least 1 and at most ${BOM_COMPONENTS_MAX} materials used.`;
export const DUPLICATE_COMPLETION_MATERIAL_MESSAGE = "This material is already on the completion: enter what was used of it once.";
/** What the service says, on `components`, when a pinned BOM component is not listed (spec Q4); `params.material` names the missing ones. */
export const MISSING_COMPONENT_MESSAGE = "Enter what was used of every BOM component, 0 when none was.";
/** What the service says about an added input of a material the tenant doesn't have. */
export const UNKNOWN_INPUT_MESSAGE = "There is no such material in this tenant.";
/** What the service says about consuming an inactive material (spec Q5, Q6). */
export const INACTIVE_INPUT_MESSAGE = "This material is inactive: production can't consume it.";
/** What the service says about consuming the order's own output (spec Q5). */
export const OUTPUT_AS_INPUT_MESSAGE = "The order's output can't also be one of its inputs.";
/** What the service says about an added input with nothing used. */
export const EXTRA_INPUT_QUANTITY_MESSAGE = "Enter how much of an added input was used: more than 0.";
/** What the service says, on `submission`, about a dialog token already spent on another order (spec Q7). */
export const SUBMISSION_REUSED_MESSAGE = "This form was already used to post a completion for another order.";
/** The most stock movements one completion may post: the ledger's limit for one posting (`stockPostingSchema`). */
export const COMPLETION_MOVEMENTS_MAX = 100;
/** What the service says, on `components`, when a completion would post more movements than the ledger takes. */
export const COMPLETION_MOVEMENTS_MESSAGE = `A completion posts at most ${COMPLETION_MOVEMENTS_MAX} stock movements: the output and every material used.`;

/** The most materials one completion lists: a recipe's components at most, and the ledger's limit. */
export const COMPLETION_LINES_MAX = BOM_COMPONENTS_MAX;
/** How many completions a page of an order's history holds: up to 100 lines each, so 2,000 lines a page. */
export const COMPLETION_PAGE_SIZE = 20;

/**
 * A quantity as entered, in any unit the material converts, that may be 0: an output of nothing (waste,
 * PRD-018) or a component that wasn't used. A decimal string without trailing zeros, as entered
 * quantities are kept.
 */
export const usedQuantitySchema = z
  .string({ error: QUANTITY_MESSAGE })
  .trim()
  .refine((text) => parseDecimal(text) !== null, QUANTITY_MESSAGE)
  .transform((text) => formatDecimal(parseDecimal(text)!));

/** One material a completion used: what, how much, in which unit. */
export const completionLineSchema = z.strictObject({
  material: materialReferenceSchema,
  quantity: usedQuantitySchema,
  unit: unitSchema,
});

/**
 * `POST /api/tenants/{tenant}/production-orders/{id}/completions`: the output and every material used.
 * Strict: the business date, expectations, variances and location are the server's, never the client's.
 * `acceptOverproduction` acknowledges a completion that takes the order past its target (spec Q2).
 */
export const productionCompletionCreateSchema = z.strictObject({
  quantity: usedQuantitySchema,
  unit: unitSchema,
  components: z
    .array(completionLineSchema, { error: COMPLETION_LINE_COUNT_MESSAGE })
    .min(1, COMPLETION_LINE_COUNT_MESSAGE)
    .max(COMPLETION_LINES_MAX, COMPLETION_LINE_COUNT_MESSAGE)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach(({ material }, index) => {
        if (seen.has(material)) ctx.addIssue({ code: "custom", path: [index, "material"], message: DUPLICATE_COMPLETION_MATERIAL_MESSAGE });
        seen.add(material);
      });
    }),
  acceptOverproduction: z.boolean().optional(),
});

export type ProductionCompletionInput = z.infer<typeof productionCompletionCreateSchema>;

/**
 * The Post completion form's server action: the order the page binds, and the dialog's `submission`
 * token, which makes a double submit post once (spec Q7).
 */
export const productionCompletionActionSchema = productionCompletionCreateSchema.extend({
  order: businessIdSchema,
  submission: z.uuid(),
});

/** The Reverse completion dialog's action: the reason, plus the order and completion bound when the dialog opens (E11-S03). */
export const productionCompletionReversalActionSchema = stockReversalSchema.extend({
  order: businessIdSchema,
  completion: businessIdSchema,
});

/** `GET …/completions/preview?quantity=&unit=`: what a completion of this output expects. */
export const productionCompletionPreviewSchema = z.strictObject({ quantity: usedQuantitySchema, unit: unitSchema });

export type ProductionCompletionPreviewInput = z.infer<typeof productionCompletionPreviewSchema>;

/** `GET …/completions?page=`: a page of the order's completions, newest first. */
export const productionCompletionListSchema = z.strictObject({ page: pageSchema });
