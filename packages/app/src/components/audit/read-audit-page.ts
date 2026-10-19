import { notFound } from "next/navigation";
import { AppError, parseInput, type AuditPage } from "@cpg/core";
import { auditListSchema, type AuditListQuery } from "@cpg/core/validators/audit/audit-list.schema";

/** A malformed `?before=`/`?limit=`, or a cursor this audit doesn't hold: no such page of the audit. */
const NO_SUCH_PAGE = new Set(["VALIDATION_FAILED", "AUDIT_CURSOR_NOT_FOUND"]);

/**
 * Reads the page of an audit that the URL's query asks for, through `list`. A query that names no
 * page of this audit renders the not-found page instead of an error.
 */
export async function readAuditPage(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  list: (query: AuditListQuery) => Promise<AuditPage>,
): Promise<{ page: AuditPage; isFirstPage: boolean }> {
  try {
    const query = parseInput(auditListSchema, await searchParams);
    return { page: await list(query), isFirstPage: !query.before };
  } catch (error) {
    if (error instanceof AppError && NO_SUCH_PAGE.has(error.code)) notFound();
    throw error;
  }
}
