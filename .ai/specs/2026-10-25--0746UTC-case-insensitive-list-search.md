# List search ignores the case of Polish letters too

**Status:** ready
**Created:** 2026-10-25 07:46 UTC
**Issue:** #223 (follow-up to #217) · **Builds on:** the list search of #217 (`core/src/domain/lists/list-query.ts`, PR #225) · **Design authority:** `AGENTS.md` (stack: SQLite through MikroORM 7, better-sqlite3), `BACKWARD_COMPATIBILITY.md`

## 📝 TLDR

Every list search added in #217 (materials, locations, customers, suppliers, BOMs, planning parameters, safety stock, users, forecasts, customer orders, production orders, requisitions, purchase orders, transfers) asks SQLite whether a field is `LIKE '%word%'`. SQLite's built-in `LIKE` ignores case for ASCII letters only, so `łożysko` doesn't find `Łożysko`, and the Help says so. This spec proposes that `@cpg/db` replace SQLite's `like()` function on every connection it opens with one that ignores case for every letter, so every list search treats `Ł` and `ł`, `Ż` and `ż`, … alike, with no schema change.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | A lower-cased shadow column per searched field (the issue's preference), SQLite's ICU extension, or replacing SQLite's `like()` with an application-defined function? | Replace `like()` on the connection, in `initOrm`. | SQLite documents that an application-defined `like` function overrides the `LIKE` operator, and better-sqlite3 registers one with `db.function`. It needs no migration, no backfill and no native dependency, and fixes all fourteen lists at once, because they all search through `searchWhere`. A shadow column needs a migration and a backfill on at least six tables, plus upkeep on every write path. An old image keeps writing during a deploy (lesson of 2026-10-21) and would leave the copy stale, which in turn needs a trigger and a repair. The issue's own reason for avoiding ICU (a native dependency) doesn't apply here. Measured on a scratch database: 20,000 rows × 2 fields take about 10 ms with the function against 0.9 ms built in. Reversible: removing one function restores today's behaviour. The owner approved going ahead autonomously on these defaults. |
| Q2 | Fold case only, or accents too (`lozysko` finds `łożysko`)? | Case only. | The issue's title asks for case. Accent folding changes which records match, and the highlight would have to fold too, so it is its own decision. Help search already folds accents; that is a different, client-side search over fixed text. |
| Q3 | Unicode normalisation (NFC vs NFD input)? | None. | Polish keyboards and browsers send precomposed letters. Normalising every compared value would cost time on every row for a case that hasn't been seen. |

## 📝 Problem Statement

- #217's decision "Search case" left list search case-insensitive for ASCII letters only, and filed #223 to finish the job (PR #225, "Decisions taken without asking").
- Polish users type descriptions and names with `Ą Ć Ę Ł Ń Ó Ś Ź Ż`. A search typed in lower case misses records that start with a capital accented letter, which is most names. The Help topic for Materials (EN and PL) warns about it: "a letter with a Polish accent matches only in the case you type it".
- Today, in the browser, the match highlight (`ui/src/backend/tables/highlight.tsx`, a `gi` regular expression) and the material autocomplete (`toLowerCase()`) already ignore the case of Polish letters. Only the server's search doesn't, so the highlight would already mark what the search could find.

## 📝 Proposed Solution

`@cpg/db` registers an application-defined SQL function `like` on the native better-sqlite3 handle of every ORM it opens (`initOrm`, next to `cacheStatements`). The function keeps SQLite's `LIKE` contract and changes only the case comparison:

- `like(pattern, value)` and `like(pattern, value, escape)` (the `X LIKE Y ESCAPE Z` form; better-sqlite3's `varargs: true` registers both arities): `%` matches any run of characters (including none, and newlines), `_` exactly one character, and the escape character makes the next character literal.
- The function returns `1` or `0`, never a boolean: better-sqlite3 refuses to return one.
- `NULL` in any argument, the escape included, gives `NULL`, as built in, so `NOT LIKE` keeps its meaning.
- A number is compared as `String(n)` and a BLOB as its bytes read as UTF-8 text. No searched column holds either.
- Letters compare without regard to case using Unicode simple case folding (a JavaScript regular expression with the `iu` flags): `Ł`/`ł`, `Ż`/`ż`, `Ó`/`ó`, and every other cased letter.
- An escape argument that isn't exactly one character, the empty string included, is an error, as built in ("ESCAPE expression must be a single character").
- The function is registered `deterministic`, and the compiled pattern is cached per (pattern, escape) in a small bounded map, because one search compares the same pattern against every row.

Nothing else changes: `searchWhere` keeps emitting `$like: '%word%'`, the services, screens and API stay as they are. The Help sentence about Polish letters is replaced by one saying case doesn't matter for any letter.

**Alternatives considered:**

- *Shadow column* (issue's preference): lost on Q1. Faster per row and indexable in theory, but `%word%` can't use an index anyway, and the upkeep and deploy-overlap gap are permanent costs.
- *ICU extension*: a native build artefact in the Docker image, for one operator.
- *`PRAGMA case_sensitive_like`*: only switches the ASCII behaviour.
- *Raw SQL `lower()`*: SQLite's `lower()` is ASCII-only as well, and raw SQL is banned in `core`/`app`.

## 📝 Architecture

- **Primary module:** `packages/db/src/` — a new `unicode-like.ts` beside `statement-cache.ts`, wired once in `orm.ts`. `@cpg/db` is the only package that touches the native handle, so the change stays inside the persistence layer.
- **Every connection gets it:** route handlers, pages and instrumentation each open their own ORM through `initOrm` (lesson of 2026-10-17), and so do migrations and tests. There is no other `MikroORM.init` in the repository.
- **Consumers:** every `$like` in the code base comes from `searchWhere` (`core/src/domain/lists/list-query.ts`). MikroORM's own schema introspection uses `LIKE` on `sqlite_master` with ASCII table names, and the same wildcard semantics leave its results unchanged.
- **Not affected:** `GLOB`, `=`, `ORDER BY` (sorting stays byte-order, as today), unique indexes.

## 📝 Edge Cases & Failure Scenarios

- *A word that folds to a different length* (`ß` vs `SS`, `İ`): simple case folding doesn't match them, which is acceptable for Polish data.
- *A pattern with regular-expression metacharacters* (`.`, `(`, `+`, `[`): each pattern character is escaped before it goes into the regular expression. `searchWords` already splits at `%`, `_` and `\`, so a typed wildcard still never matches "anything".
- *Backtracking*: every pattern a search sends is `%word%`, one leading and one trailing run, which an anchored regular expression matches in O(n·m) time for a value of n and a word of m characters; a search is at most 100 characters and 5 words (`SEARCH_MAX`, `SEARCH_WORDS_MAX`). A pattern with several `%` runs inside it can backtrack polynomially, and no pattern built from user input has one.
- *Function throws*: only for a bad escape argument, which no code path sends. SQLite would surface it as a query error, the same as the built-in operator.
- *Old image during a deploy*: it keeps the built-in `LIKE` on its own connections. No data is written differently, so nothing needs repairing once it stops.
- *Cost*: about 0.25 µs per comparison measured. A realistic Test tenant list stays well under a millisecond per search. The implementation step measures a search over the realistic dataset's materials and records it in the run log.

## 📝 Risks & Impact Review

- **No contract changes.** Searches return a superset of today's results (records differing only in non-ASCII letter case now match too). The API list routes take no `q` yet (#221), so no API response changes. `BACKWARD_COMPATIBILITY.md` needs no entry.
- **Rollback:** delete the registration; nothing is stored.
- **Lost optimisation:** SQLite's LIKE-prefix index optimisation is disabled while `like` is overridden. No query in the repository relies on it: every search pattern starts with `%`.

## 📋 Phasing

One phase, one implementation PR: the function, its wiring, the Help copy and the tests.

## 📋 Implementation Plan

### Phase 1 — Unicode case-insensitive `LIKE`

1. **`packages/db/src/unicode-like.ts`** — export a pure `likePattern(pattern, escape?)` that compiles a `LIKE` pattern into an anchored `iu` regular expression (wildcards as `[\s\S]*` and `[\s\S]`, every other character escaped with the set the `u` flag allows: `^$\.*+?()[]{}|/`), and `registerUnicodeLike(db)`, which registers `like` with `{ deterministic: true, varargs: true }` and a bounded compiled-pattern cache. Unit tests (`unicode-like.test.ts`) run real SQL (`select 'a' like 'A'`, `… escape '\'`) on a better-sqlite3 database: `%`, `_`, escape, metacharacters, a multi-line value, `NULL` operands and escape, a number and a BLOB, an empty and a two-character escape, Polish letters in both directions, `NOT LIKE`, and the cache bound.
2. **Wire it in `initOrm`** (`packages/db/src/orm.ts`) after `cacheStatements`. Test through `initOrm` on a temp SQLite file with the migrations applied: a MikroORM `find` with `$like: '%łożysko%'` finds `Łożysko`.
3. **Service-level regression** — a `core/src/domain/lists` or service test (materials, plus one named-record kind) proving `searchWhere` + `em.find` finds a capital-Polish-letter record from a lower-case word and the reverse, in both the Test and Prod tenants. Update the `searchWhere` doc comment.
4. **Help copy** — replace the "letter with a Polish accent matches only in the case you type it" sentence in `app/src/help/topics.ts` (EN and PL) with one saying case doesn't matter for any letter, Polish ones included. Update its test.
5. **Integration test** — extend `tests/integration/materials.test.ts`'s search scenario: create a material whose description starts with `Ł`, search with the lower-case word, and expect it in the results with the match marked.
6. **Measure** — time a search over the realistic dataset's materials with and without the function, and record it in the run log.
