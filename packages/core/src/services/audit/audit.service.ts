import { GlobalAuditEvent, TenantAuditEvent, type AuditChannel, type AuditSnapshot, type EntityManager } from "@cpg/db";
import { NotFoundError } from "../../http/errors";
import type { AuditListQuery } from "../../validators/audit/audit-list.schema";

/** One audit entry, as screens and the API show it. */
export interface AuditEntryView {
  id: string;
  occurredAt: Date;
  action: string;
  subject: { type: string; id: string; label: string };
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  actor: { userId: string; username: string };
  sessionId: string | null;
  channel: AuditChannel;
  token: { id: string; name: string } | null;
}

/** A page of entries, newest first, and the cursor for the next (older) page when there is one. */
export interface AuditPage {
  entries: AuditEntryView[];
  nextBefore: string | null;
}

/** A `before` cursor that names no entry of this audit (or one of another tenant's). */
export const auditCursorNotFound = () =>
  new NotFoundError("AUDIT_CURSOR_NOT_FOUND", "That entry isn't in this audit.");

type AuditEvent = GlobalAuditEvent | TenantAuditEvent;

/**
 * Reads the Global and tenant audits. Read-only by design: nothing in CPG changes or removes an
 * entry (AUD-010), and the database triggers refuse it anyway. `listTenant` needs a tenant scope,
 * like every tenant read, and sees only that tenant's entries (R05).
 */
export class AuditService {
  private readonly em: EntityManager;

  constructor({ em }: { em: EntityManager }) {
    this.em = em;
  }

  /** A page of the Global audit. */
  async listGlobal({ before, limit }: AuditListQuery): Promise<AuditPage> {
    const cursor = before ? found(await this.em.findOne(GlobalAuditEvent, { id: before })) : null;
    return toPage(await this.em.find(GlobalAuditEvent, olderThan(cursor), pageOptions(limit)), limit);
  }

  /** A page of the scope's tenant audit. */
  async listTenant({ before, limit }: AuditListQuery): Promise<AuditPage> {
    const cursor = before ? found(await this.em.findOne(TenantAuditEvent, { id: before })) : null;
    return toPage(await this.em.find(TenantAuditEvent, olderThan(cursor), pageOptions(limit)), limit);
  }
}

/** The cursor entry, or `AUDIT_CURSOR_NOT_FOUND` when this audit has none with that id. */
function found<T>(cursor: T | null): T {
  if (!cursor) throw auditCursorNotFound();
  return cursor;
}

/**
 * Keyset paging on `(occurredAt, id)`, newest first: entries added while someone pages back never
 * shift, repeat or skip the older pages. Ties within one millisecond fall back to `id`.
 */
function olderThan(cursor: Pick<AuditEvent, "occurredAt" | "id"> | null) {
  if (!cursor) return {};
  return {
    $or: [{ occurredAt: { $lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { $lt: cursor.id } }],
  };
}

/** One row more than the page, to know whether an older page exists. */
function pageOptions(limit: number) {
  return { orderBy: { occurredAt: "desc", id: "desc" } as const, limit: limit + 1 };
}

function toPage(rows: AuditEvent[], limit: number): AuditPage {
  const entries = rows.slice(0, limit).map(toView);
  return { entries, nextBefore: rows.length > limit ? entries[entries.length - 1].id : null };
}

function toView(event: AuditEvent): AuditEntryView {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    action: event.action,
    subject: { type: event.subjectType, id: event.subjectId, label: event.subjectLabel },
    // Unset (not null) only on an entry still held from this request's own writes.
    before: event.before ?? null,
    after: event.after ?? null,
    actor: { userId: event.actorUserId, username: event.actorUsername },
    sessionId: event.sessionId ?? null,
    channel: event.channel,
    token: event.tokenId && event.tokenName ? { id: event.tokenId, name: event.tokenName } : null,
  };
}
