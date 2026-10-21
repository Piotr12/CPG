import type { AuditEntryView, AuditReversalLink } from "@cpg/core";
import type { AuditFilterQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { isCalendarDate } from "@cpg/core/validators/dates/calendar-date.schema";

/** The filter parameters, in the order an audit URL lists them. */
export const FILTER_KEYS = ["subjectType", "subjectId", "account", "channel", "from", "to"] as const satisfies readonly (keyof AuditFilterQuery)[];

/**
 * An audit screen's URL for a query: the active filters (absent ones left out) and, for an older page,
 * the `before` cursor. Paging links pass the same filters, so walking back never drops them.
 */
export function auditUrl(path: string, query: AuditFilterQuery, before?: string): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  if (before) params.set("before", before);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** One record's history on an audit screen: its type and ID as recorded on an entry's subject. */
export function recordHistoryUrl(path: string, subject: { type: string; id: string }): string {
  return auditUrl(path, { subjectType: subject.type, subjectId: subject.id });
}

/** A parsed query's filters alone, without its page position. */
export function filtersOf(query: AuditFilterQuery): AuditFilterQuery {
  return Object.fromEntries(FILTER_KEYS.filter((key) => query[key] !== undefined).map((key) => [key, query[key]]));
}

/** A filter parameter's name. */
export type AuditFilterKey = (typeof FILTER_KEYS)[number];

/**
 * The filters as a URL sent them, before validation: what a refused form shows back so the reader can
 * correct it. A repeated parameter counts once; a channel other than UI or API is shown as "All".
 */
export function rawFiltersOf(params: Record<string, string | string[] | undefined>): AuditFilterQuery {
  const raw = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, [params[key]].flat()[0]?.trim()]).filter(([, value]) => value),
  ) as Record<AuditFilterKey, string | undefined>;
  const { channel, ...rest } = raw;
  return { ...rest, ...(channel === "ui" || channel === "api" ? { channel } : {}) };
}

/** Whether the query narrows the audit at all. */
export function isFiltered(query: AuditFilterQuery): boolean {
  return FILTER_KEYS.some((key) => query[key] !== undefined);
}

/**
 * The business date an entry recorded (AUD-030): its snapshot's `businessDate`, after the change first,
 * then before it, and only when it is a real `YYYY-MM-DD`; otherwise null. Stock postings, reversals,
 * transfers, goods receipts and issues, and production completions record one.
 */
export function businessDateOf({ before, after }: Pick<AuditEntryView, "before" | "after">): string | null {
  for (const value of [after?.businessDate, before?.businessDate]) {
    if (typeof value === "string" && isCalendarDate(value)) return value;
  }
  return null;
}

/** The movements an entry's stock movement reverses, or is reversed by, among a page's links. */
export interface EntryReversal {
  reverses: string | null;
  reversedBy: string | null;
}

/** How an entry about a stock movement links to its reversal partner; null for any other subject. */
export function reversalOf(subject: AuditEntryView["subject"], links: readonly AuditReversalLink[]): EntryReversal | null {
  if (subject.type !== "StockMovement") return null;
  const reverses = links.find(({ inverse }) => inverse === subject.id)?.original ?? null;
  const reversedBy = links.find(({ original }) => original === subject.id)?.inverse ?? null;
  return reverses || reversedBy ? { reverses, reversedBy } : null;
}

/** The ids of the stock movements a page's entries are about: what `reversalLinks` is asked for. */
export function movementIdsOf(entries: readonly Pick<AuditEntryView, "subject">[]): string[] {
  return [...new Set(entries.filter(({ subject }) => subject.type === "StockMovement").map(({ subject }) => subject.id))];
}
