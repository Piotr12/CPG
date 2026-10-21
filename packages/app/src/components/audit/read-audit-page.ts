import { notFound } from "next/navigation";
import { AppError, parseInput, type AuditPage } from "@cpg/core";
import { auditListSchema, type AuditFilterQuery, type AuditListQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { filtersOf } from "./audit-query";

/** A malformed `?before=`/`?limit=` or filter, or a cursor this audit doesn't hold: no such page of the audit. */
const NO_SUCH_PAGE = new Set(["VALIDATION_FAILED", "AUDIT_CURSOR_NOT_FOUND"]);

/**
 * Reads the page of an audit that the URL's query asks for, through `list`, and returns the filters it
 * was read with, so the form and the paging links keep them. A query that names no page of this audit
 * renders the not-found page instead of an error.
 */
export async function readAuditPage(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  list: (query: AuditListQuery) => Promise<AuditPage>,
): Promise<{ page: AuditPage; isFirstPage: boolean; query: AuditFilterQuery }> {
  try {
    const query = parseInput(auditListSchema, await searchParams);
    return { page: await list(query), isFirstPage: !query.before, query: filtersOf(query) };
  } catch (error) {
    if (error instanceof AppError && NO_SUCH_PAGE.has(error.code)) notFound();
    throw error;
  }
}
