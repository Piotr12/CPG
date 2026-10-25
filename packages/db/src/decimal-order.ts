import { raw } from "@mikro-orm/core";

/**
 * An `orderBy` key for the length of the integer part of the decimal text in `column`, a column of
 * the queried entity's own table (#224). Ordering by it and then by the text is numeric order for
 * non-negative decimals with no leading zeros, which every stored quantity is (R03): more integer
 * digits is a larger number, and equal lengths compare digit by digit. `CAST(… AS REAL)` would lose
 * the last digits of R03's eighteen.
 *
 * The only raw SQL `@cpg/db` exports for queries: an `ORDER BY` term, never a filter, so the tenant
 * filter applies unchanged. Build a fresh key for every query. `column` is a plain column name the code
 * chooses, never user input; anything else (a dotted path, a camelCase property) is refused.
 */
export function decimalLengthKey(column: string): symbol {
  if (!/^[a-z][a-z_]*$/.test(column)) throw new Error(`Not a column name: ${column}`);
  // A fragment becomes a symbol when used as a computed key; MikroORM types it the same way.
  return raw<symbol>((alias: string) => `instr(${alias}.${column} || '.', '.')`);
}
