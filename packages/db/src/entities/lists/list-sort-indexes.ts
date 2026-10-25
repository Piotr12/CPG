/** The name of the index that serves a list sorted by `column` in `dir`, then by business ID ascending. */
export function listSortIndexName(table: string, column: string, dir: "asc" | "desc"): string {
  return `${table}_tenant_code_${column}${dir === "desc" ? "_desc" : ""}_code_index`;
}

/**
 * The indexes a paged list needs to sort by its own `columns` from an index (#220): for each one,
 * `(tenant_code, column, code)` for the ascending sort and `(tenant_code, column DESC, code)` for the
 * descending one, since ties stay in ascending ID order whichever way the column runs (#217 D3), and
 * an index read backwards would give descending IDs.
 *
 * Both are `expression` indexes. MikroORM 7 reads SQLite indexes back without their column
 * direction, so one declared with `columns: [{ sort: "desc" }]` never matches the database and the
 * schema diff keeps recreating it; an expression is compared as written.
 */
export function listSortIndexes(table: string, columns: readonly string[]): { name: string; expression: string }[] {
  return columns.flatMap((column) =>
    (["asc", "desc"] as const).map((dir) => {
      const name = listSortIndexName(table, column, dir);
      return { name, expression: `create index \`${name}\` on \`${table}\` (\`tenant_code\`, \`${column}\`${dir === "desc" ? " desc" : ""}, \`code\`)` };
    }),
  );
}
