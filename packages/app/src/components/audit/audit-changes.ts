import type { AuditEntryView } from "@cpg/core";

type Snapshot = AuditEntryView["before"];
type Value = NonNullable<Snapshot>[string];

/** One line of an entry's Changes column. */
export type AuditChange =
  | { kind: "set"; field: string; value: Value }
  | { kind: "changed"; field: string; before: Value; after: Value };

/**
 * What an entry changed, field by field. A create lists every new value; an edit lists only the
 * fields whose value differs; an entry without snapshots (a password reset) lists nothing.
 */
export function auditChanges(before: Snapshot, after: Snapshot): AuditChange[] {
  if (!before || !after) {
    return Object.entries(after ?? before ?? {}).map(([field, value]) => ({ kind: "set", field, value }));
  }
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ kind: "changed", field, before: before[field] ?? null, after: after[field] ?? null }));
}

/** A snapshot value as text; a missing or null value is a dash. */
export function formatAuditValue(value: Value): string {
  return value === null ? "—" : String(value);
}
