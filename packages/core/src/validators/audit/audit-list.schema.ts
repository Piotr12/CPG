import { z } from "zod";

/** Entries per page: a screenful, small enough to read without scrolling for long. */
export const AUDIT_PAGE_SIZE = 50;
/** The most one API call may ask for, so a single request stays cheap. */
export const AUDIT_MAX_PAGE_SIZE = 100;

/**
 * One page of an audit, from URL query parameters (strings): `before` is the id of the last entry
 * already seen (keyset paging, newest first), `limit` the page size.
 */
export const auditListSchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE_SIZE).default(AUDIT_PAGE_SIZE),
});

export type AuditListQuery = z.output<typeof auditListSchema>;
