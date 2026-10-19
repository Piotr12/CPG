import { randomUUID } from "node:crypto";
import { p } from "@mikro-orm/core";

/** Where a change came from: CPG's own screens, or the API (R08). */
export const AUDIT_CHANNELS = ["ui", "api"] as const;
export type AuditChannel = (typeof AUDIT_CHANNELS)[number];

/** One field's value in an audit snapshot: plain JSON scalars only. */
export type AuditValue = string | number | boolean | null;
/** An allowlisted copy of a record's fields before or after a change. Never a secret. */
export type AuditSnapshot = Record<string, AuditValue>;

/** What the abort triggers say when anything tries to change or remove an entry (AUD-010). */
export const AUDIT_APPEND_ONLY = "audit is append-only";

/**
 * The columns both audit stores share. Actor, session and subject are copied values, not foreign
 * keys: an entry describes the world as it was and never depends on the rows it mentions.
 */
export function auditEventProperties() {
  return {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    occurredAt: p.datetime().onCreate(() => new Date()),
    /** `concept.entity.action`, e.g. `users.user.deactivated`. */
    action: p.string(),
    subjectType: p.string(),
    subjectId: p.string(),
    /** A human name for the subject at the time of the change. */
    subjectLabel: p.string(),
    before: p.json<AuditSnapshot>().nullable(),
    after: p.json<AuditSnapshot>().nullable(),
    actorUserId: p.string(),
    actorUsername: p.string(),
    /** `Session.id` of the acting session, never its token. Null only for a bearer-token write. */
    sessionId: p.string().nullable(),
    channel: p.enum(AUDIT_CHANNELS),
    tokenId: p.string().nullable(),
    tokenName: p.string().nullable(),
  };
}

/** Triggers that make a table append-only in the database itself, whatever the code does. */
export function appendOnlyTriggers(table: string) {
  const body = `select raise(abort, '${AUDIT_APPEND_ONLY}');`;
  return [
    { name: `${table}_no_update`, timing: "before" as const, events: ["update" as const], body },
    { name: `${table}_no_delete`, timing: "before" as const, events: ["delete" as const], body },
  ];
}
