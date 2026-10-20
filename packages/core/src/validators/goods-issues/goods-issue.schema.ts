import { z } from "zod";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { DUPLICATE_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "../purchasing/purchasing-fields.schema";
import { pageSchema, shipmentReferenceSchema } from "../shipments/shipment.schema";

/** The English messages; screens translate them by matching these constants. */
export const ISSUE_LINE_COUNT_MESSAGE = "Issue at least 1 and at most 100 lines.";
/** What the service says, next to the line, about a line of another shipment. */
export const ISSUE_LINE_SHIPMENT_MESSAGE = "A goods issue covers one shipment: this line is from another.";
/** What the service says about a line number the shipment doesn't have. */
export const ISSUE_NO_SUCH_LINE_MESSAGE = "This shipment has no such line.";
/** What the service says about a quantity above the line's to issue (SAL-012, SAL-018). */
export const ISSUE_QUANTITY_MESSAGE = "This is more than is still to issue on this line: the order line's outstanding or the shipment's plan.";

/** The most lines one goods issue carries, as many as a shipment. */
export const ISSUE_LINES_MAX = 100;

/** One goods-issue line (spec Q4): the shipment line it issues, by its 1-based number, and the quantity that left. */
export const issueLineSchema = z.object({
  line: z.number({ error: LINE_NUMBER_MESSAGE }).int(LINE_NUMBER_MESSAGE).min(1, LINE_NUMBER_MESSAGE),
  quantity: enteredQuantitySchema,
  unit: unitSchema,
  shipment: shipmentReferenceSchema.optional(),
});

/**
 * `POST /api/tenants/{tenant}/goods-issues`, and the Post goods issue form: one shipment and 1 to 100
 * lines, each for a different line of it. No date: an issue posts on today's business date, and a
 * client's date is dropped (INV-010, INV-011).
 */
export const issueCreateSchema = z.object({
  shipment: shipmentReferenceSchema,
  lines: z
    .array(issueLineSchema, { error: ISSUE_LINE_COUNT_MESSAGE })
    .min(1, ISSUE_LINE_COUNT_MESSAGE)
    .max(ISSUE_LINES_MAX, ISSUE_LINE_COUNT_MESSAGE)
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();
      lines.forEach(({ line }, index) => {
        if (seen.has(line)) ctx.addIssue({ code: "custom", path: [index, "line"], message: DUPLICATE_LINE_MESSAGE });
        seen.add(line);
      });
    }),
});

export type IssueCreateInput = z.infer<typeof issueCreateSchema>;

/** The Post goods issue form's own check: the lines only, since the page binds the shipment. */
export const issueFormSchema = issueCreateSchema.omit({ shipment: true });

/** `GET /api/tenants/{tenant}/goods-issues`: a page of every goods issue, or of one shipment's. */
export const issueListQuerySchema = z.object({ shipment: shipmentReferenceSchema.optional(), page: pageSchema });
