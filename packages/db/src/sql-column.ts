/**
 * `column` unchanged when it is a plain column name of the queried entity's own table, for the raw query
 * terms `@cpg/db` exports. Their callers choose the name in code, never from input; anything else (a
 * dotted path, a camelCase property, SQL) is refused, so no other SQL can reach a query through them.
 */
export function plainColumn(column: string): string {
  if (!/^[a-z][a-z_]*$/.test(column)) throw new Error(`Not a column name: ${column}`);
  return column;
}
