import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { appendOnlyTriggers, auditEventProperties } from "./audit-event";

/**
 * An entry in the Global audit: account-level changes (users, passwords, preferences, and later
 * tokens, read-only flags and Test resets). Belongs to no tenant and is kept indefinitely (R08).
 * Rows are only ever inserted; the triggers abort any update or delete.
 */
export const GlobalAuditEvent = defineEntity({
  name: "GlobalAuditEvent",
  properties: auditEventProperties(),
  indexes: [{ properties: ["occurredAt"] }],
  triggers: appendOnlyTriggers("global_audit_event"),
});

export type GlobalAuditEvent = InferEntity<typeof GlobalAuditEvent>;
