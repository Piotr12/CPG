/** The part of a better-sqlite3 `Database` the registration uses. */
export interface DefiningFunctions {
  function(name: string, options: { deterministic: boolean }, implementation: (...args: never[]) => unknown): unknown;
}

/** A value better-sqlite3 hands a SQL function: text, a number, a BLOB or `NULL`. */
export type SqlValue = string | number | bigint | Uint8Array | null;

/** How many compiled patterns the cache keeps; the oldest is dropped beyond it. */
export const LIKE_CACHE_SIZE = 100;

/** SQLite's own wording, so a refused escape reads the same as with the built-in operator. */
export const ESCAPE_MESSAGE = "ESCAPE expression must be a single character";

/** The characters a regular expression with the `u` flag may escape; any other escape is a syntax error there. */
const SYNTAX_CHARACTERS = /[\^$\\.*+?()[\]{}|/]/;

/** A regular expression that matches nothing: SQLite's verdict on a pattern ending in its escape character. */
const NO_MATCH = /(?!)/u;

/**
 * `pattern` as an anchored regular expression with SQLite's `LIKE` semantics, except that every letter
 * matches either case (Unicode simple case folding), not only ASCII ones (#223): `%` matches any run of
 * characters, newlines included, `_` exactly one, and `escape` makes the next character literal.
 */
export function likePattern(pattern: string, escape?: string): RegExp {
  let source = "";
  let escaping = false;
  for (const char of pattern) {
    if (escaping) {
      escaping = false;
    } else if (char === escape) {
      escaping = true;
      continue;
    } else if (char === "%") {
      source += "[\\s\\S]*";
      continue;
    } else if (char === "_") {
      source += "[\\s\\S]";
      continue;
    }
    source += SYNTAX_CHARACTERS.test(char) ? `\\${char}` : char;
  }
  return escaping ? NO_MATCH : new RegExp(`^${source}$`, "iu");
}

/** A SQL value as the text `LIKE` compares: a BLOB's bytes read as UTF-8, a number in JavaScript's notation. */
function text(value: Exclude<SqlValue, null>): string {
  return value instanceof Uint8Array ? Buffer.from(value).toString("utf8") : String(value);
}

/**
 * Replaces SQLite's `like()` on `db`, the function behind `X LIKE Y` and `X LIKE Y ESCAPE Z`, with
 * {@link likePattern}'s, so list searches ignore the case of Polish letters too (#223): SQLite's own
 * ignores it for ASCII letters only. `NULL` anywhere gives `NULL`, as built in. One search compares the
 * same pattern with every row, so compiled patterns are cached, at most `size` of them.
 */
export function registerUnicodeLike(db: DefiningFunctions, size = LIKE_CACHE_SIZE): void {
  const cache = new Map<string, RegExp>();
  const like = (pattern: SqlValue, value: SqlValue, escape?: SqlValue): number | null => {
    if (pattern === null || value === null || escape === null) return null;
    const escapeText = escape === undefined ? undefined : text(escape);
    if (escapeText !== undefined && [...escapeText].length !== 1) throw new Error(ESCAPE_MESSAGE);
    const patternText = text(pattern);
    // The escape is one character, so the key splits back into exactly one (escape, pattern).
    const key = escapeText === undefined ? `-${patternText}` : `+${escapeText}${patternText}`;
    let compiled = cache.get(key);
    if (!compiled) {
      compiled = likePattern(patternText, escapeText);
      cache.set(key, compiled);
      if (cache.size > size) cache.delete(cache.keys().next().value!);
    }
    return compiled.test(text(value)) ? 1 : 0;
  };
  // SQLite looks a function up by name and argument count, so each form of the operator is replaced on its own.
  db.function("like", { deterministic: true }, (pattern: SqlValue, value: SqlValue) => like(pattern, value));
  db.function("like", { deterministic: true }, (pattern: SqlValue, value: SqlValue, escape: SqlValue) => like(pattern, value, escape));
}
