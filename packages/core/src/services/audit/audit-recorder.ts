import {
  currentTenant,
  GlobalAuditEvent,
  TenantAuditEvent,
  TenantViolationError,
  type AuditSnapshot,
  type EntityManager,
} from "@cpg/db";
import type { AuditActor } from "./actor";

/** One change, as the service that made it describes it. */
export interface AuditEntry {
  /** `concept.entity.action`, e.g. `users.user.created`. */
  action: string;
  subject: { type: string; id: string; label: string };
  /** An allowlisted snapshot; null on create. */
  before: AuditSnapshot | null;
  /** An allowlisted snapshot; null on removal, or when the change has no recordable values. */
  after: AuditSnapshot | null;
}

/**
 * A key no snapshot may carry. The per-entity allowlists are the real protection; this is a
 * backstop that fails the whole write when one of them is ever widened by mistake (AUD-028).
 */
const SECRET_KEY = /password|hash|secret/i;

/**
 * Adds a Global audit entry to `em`, the EntityManager the caller is writing with. It is only
 * created here: the caller's own flush (or transaction) commits it together with the change, so a
 * change is never stored without its entry, nor an entry without its change.
 */
export function recordGlobalAudit(em: EntityManager, actor: AuditActor, entry: AuditEntry): void {
  em.create(GlobalAuditEvent, toEvent(actor, entry));
}

/** `recordGlobalAudit` for the tenant audit; `em` must be scoped to the tenant that changed. */
export function recordTenantAudit(em: EntityManager, actor: AuditActor, entry: AuditEntry): void {
  if (!currentTenant(em)) throw new TenantViolationError("audit tenant-owned data without a tenant scope");
  em.create(TenantAuditEvent, toEvent(actor, entry));
}

function toEvent(actor: AuditActor, { action, subject, before, after }: AuditEntry) {
  assertNoSecrets(before);
  assertNoSecrets(after);
  return {
    action,
    subjectType: subject.type,
    subjectId: subject.id,
    subjectLabel: subject.label,
    before,
    after,
    actorUserId: actor.userId,
    actorUsername: actor.username,
    sessionId: actor.sessionId,
    channel: actor.channel,
    tokenId: actor.token?.id ?? null,
    tokenName: actor.token?.name ?? null,
  };
}

function assertNoSecrets(snapshot: AuditSnapshot | null): void {
  const key = Object.keys(snapshot ?? {}).find((name) => SECRET_KEY.test(name));
  if (key) throw new Error(`Audit snapshots must not carry secrets (field "${key}").`);
}
