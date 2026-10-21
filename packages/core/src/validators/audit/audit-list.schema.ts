import { z } from "zod";
import { AUDIT_CHANNELS } from "@cpg/db";
import { calendarDateSchema } from "../dates/calendar-date.schema";

/** Entries per page: a screenful, small enough to read without scrolling for long. */
export const AUDIT_PAGE_SIZE = 50;
/** The most one API call may ask for, so a single request stays cheap. */
export const AUDIT_MAX_PAGE_SIZE = 100;

/** A GET form's "All" choice and an emptied text field send an empty value: no filter. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

/**
 * One page of an audit, from URL query parameters (strings): `before` is the id of the last entry
 * already seen (keyset paging, newest first), `limit` the page size. The filters narrow the audit,
 * combined with AND (spec Q2–Q4): the record (`subjectType`, and `subjectId` within that type), the
 * acting account's username, the channel, and a range of UTC days (`from`, `to`, both inclusive) on
 * the audit timestamp. Unknown keys are ignored.
 */
export const auditListSchema = z
  .object({
    before: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE_SIZE).default(AUDIT_PAGE_SIZE),
    subjectType: optional(z.string().trim().regex(/^[A-Za-z]{1,64}$/, "Enter a record type such as PurchaseOrder.")),
    subjectId: optional(z.string().trim().min(1).max(200)),
    account: optional(z.string().trim().min(1).max(64).toLowerCase()),
    channel: optional(z.enum(AUDIT_CHANNELS)),
    from: optional(calendarDateSchema),
    to: optional(calendarDateSchema),
  })
  .superRefine((query, context) => {
    if (query.subjectId !== undefined && query.subjectType === undefined) {
      context.addIssue({ code: "custom", path: ["subjectId"], message: "Choose the record type as well: IDs repeat across types." });
    }
    if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
      context.addIssue({ code: "custom", path: ["to"], message: "The end date can't be before the start date." });
    }
  });

export type AuditListQuery = z.output<typeof auditListSchema>;
/** The filters alone, without the page position: what a history view is narrowed to. */
export type AuditFilterQuery = Omit<AuditListQuery, "before" | "limit">;
