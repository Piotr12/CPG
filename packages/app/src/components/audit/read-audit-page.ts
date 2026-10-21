import { notFound } from "next/navigation";
import { AppError, parseInput, ValidationError, type AuditPage } from "@cpg/core";
import { auditListSchema, type AuditFilterQuery, type AuditListQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { FILTER_KEYS, filtersOf, rawFiltersOf, type AuditFilterKey } from "./audit-query";

/** A malformed `?before=`/`?limit=`, or a cursor this audit doesn't hold: no such page of the audit. */
const NO_SUCH_PAGE = new Set(["VALIDATION_FAILED", "AUDIT_CURSOR_NOT_FOUND"]);

/** What an audit screen renders: a page, or the filters the reader has to correct first. */
export interface AuditScreenRead {
  page: AuditPage;
  isFirstPage: boolean;
  /** The filters the page was read with, or, when refused, as the URL sent them. */
  query: AuditFilterQuery;
  /** The filters refused, by parameter; empty when the page was read. */
  invalid: AuditFilterKey[];
}

const NOTHING: AuditPage = { entries: [], nextBefore: null };

/**
 * Reads the page of an audit that the URL's query asks for, through `list`, and returns the filters it
 * was read with, so the form and the paging links keep them. Refused filters read nothing and come back
 * as `invalid`, for the form to explain beside the values as sent. A bad page position (`before`,
 * `limit`) or a cursor this audit doesn't hold names no page of this audit: the not-found page.
 */
export async function readAuditPage(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  list: (query: AuditListQuery) => Promise<AuditPage>,
): Promise<AuditScreenRead> {
  const params = await searchParams;
  try {
    const query = parseInput(auditListSchema, params);
    return { page: await list(query), isFirstPage: !query.before, query: filtersOf(query), invalid: [] };
  } catch (error) {
    const fields = error instanceof ValidationError ? Object.keys(error.fieldErrors) : [];
    const filters = FILTER_KEYS.filter((key) => fields.includes(key));
    if (filters.length > 0 && filters.length === fields.length) {
      return { page: NOTHING, isFirstPage: true, query: rawFiltersOf(params), invalid: filters };
    }
    if (error instanceof AppError && NO_SUCH_PAGE.has(error.code)) notFound();
    throw error;
  }
}
