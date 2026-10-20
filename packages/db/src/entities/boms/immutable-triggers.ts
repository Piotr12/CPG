/** What the triggers say when anything tries to change a BOM revision or one of its lines (R04). */
export const BOM_REVISION_IMMUTABLE = "BOM revisions are immutable";

/**
 * Triggers that make a table's rows unchangeable in the database itself, whatever the code does: a
 * revision is a snapshot production orders will pin (R04). Unlike the audit's `appendOnlyTriggers`,
 * rows can still be deleted, which the slice-2 Test reset needs; no service deletes them.
 */
export function noUpdateTriggers(table: string) {
  const body = `select raise(abort, '${BOM_REVISION_IMMUTABLE}');`;
  return [{ name: `${table}_no_update`, timing: "before" as const, events: ["update" as const], body }];
}
