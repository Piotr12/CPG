# Common brief — workers of the "design proposal A" run (#217)

Read, in order: `AGENTS.md`, `.ai/lessons.md`, `.ai/docs/engineering-standards.md`, issue #217 (`gh issue view 217`), this run's `PLAN.md` (decisions D1–D9 are binding), then your own `w<n>-*.md`.

## What exists (the lead built it; reuse, never re-implement)

| Piece | Where | Use |
|---|---|---|
| Search/sort helpers | `core/src/domain/lists/list-query.ts` | `searchWhere(q, fields)` (dotted paths into references: `material.code`), `listOrderBy(path, dir)` (business ID tie-breaker) |
| Schemas | `core/src/validators/lists/list-query.schema.ts` | `listSortSchema(KEYS)`, `ListOptions<Key>`, `searchSchema` |
| Reference service | `core/src/services/materials/material.service.ts` `list()` + `validators/materials/material-list.schema.ts` | copy this shape: a `<concept>-list.schema.ts` with `XXX_SORTS` and `xxxSortSchema`, a `SEARCH_FIELDS` array and a `SORT_PATHS` record in the service |
| `DataTable` sort | `ui/src/backend/tables/data-table.tsx` | column `sortKey`, table `sort={{ key, dir, href: links.sortHref, link: Link }}` |
| `Highlight` | `ui/src/backend/tables/highlight.tsx` | wrap the ID and the searched text cells |
| URL helpers | `app/src/components/lists/list-params.ts` | `readSearch`, `readSort`, `listLinks` (`pageHref` for `PageLinks`, `extra` for a list's existing filters) |
| Search bar | `app/src/components/lists/list-search-bar.tsx` | `<ListSearchBar>` above the table; `<NoSearchResults>` as the empty state when `q` is set |
| Reference page | `app/src/app/admin/[tenant]/materials/page.tsx`, `components/materials/materials-table.tsx` (+ their tests) | copy the wiring |
| `Autocomplete` | `ui/src/backend/forms/autocomplete.tsx`; `CrudField` `type: "autocomplete"` with `choices` + `autocompleteLabels` | material pickers in entry forms (D8) |
| Material choices | `app/src/components/materials/material-picker.ts` | `materialOptions(materials)`, `materialPickerLabels(messages.lists)`, placeholder `messages.lists.materialPicker.placeholder` |
| Strings | `messages.lists.*` (shared) | add only your concepts' `search: { label, hint }` to their own dictionary sections, EN and PL |
| Integration helper | `tests/integration/browser.ts` `chooseFromList(browser, selector, typed, code)` | replaces `select` on a material picker |

## Rules for every list you own

1. Service: `list({ page?, q?, sort?, dir? })` (keep a positional `page` caller working or update every caller, the API route included), plus `count({ q })` when the list is paged. Search fields: the business ID, the row's name/description, and the ID + description/name of the material/customer/supplier/location it shows. Sort keys: every column a planner would sort, by a stored value (D3: never a decimal-string quantity, never a UUID; a reference sorts by its `code`). Unit tests against a real SQLite (as `material.service.test.ts` does): each sort key both ways, the tie-breaker across a page boundary where the list pages (lesson 2026-10-21 "Sort and page by business ID"), search by each field, tenant isolation.
2. API unchanged (D6): routes still accept only `?page=` (unknown keys 400); their behaviour and order are identical. Run the concept's `*-api.test.ts` integration file.
3. Page: `readSearch` + `readSort` + `listLinks` (defaults = the list's current order, so `?page=2` links stay as they are); `<ListSearchBar>` between `PageHeader` and the table (count = the service's `count({ q })` for paged lists); `PageLinks href={links.pageHref}`; `notFound()` for a bad `page` stays.
4. Table: `sortKey` on sortable columns, `Highlight` in searched cells, empty state `NoSearchResults` when `q` is set.
5. Forms (D8): every entry-form control that chooses a **material** becomes an `Autocomplete` (filters in GET forms stay `NativeSelect`). Keep the inactive-material rules the form has today (the choices it offers). An edit form whose stored material is no longer offered must still show it (as `recipe-form` does for removed conversions).
6. i18n: EN + PL for everything; `messages.test.ts` checks key parity.
7. 100 % unit coverage on what you add or change (`npm run test:coverage`), lint, typecheck. Never lower thresholds or add ignore comments.
8. Integration: update every integration file of your concepts that the change breaks (a material `select` → `chooseFromList`; a `main button` count now also sees the Search button), and add at least one browser test per list you touched: sort by a header, search, clear. Run only the files you touch, against a local standalone build (see "Running the app").
9. Stay in your scope. If you need a change outside it (a shared file, another concept, `ui`/`core` shared pieces), **write to the lead's inbox** (`$CEZ_TREE_DIR/inbox/root/`) and continue with something else; do not edit it. Shared dictionaries `en.ts`/`pl.ts`: only your concepts' sections.

## Running the app

Docker may be unavailable (lesson 2026-10-23). Build (`npm run build`), then copy the standalone build to a fresh dir and start it with a fresh `DATA_DIR`, as `.ai/pipeline/runs/2026-10-24--0925UTC-design-system-v1/scripts/standalone-server.sh <port>` does (read it; run it from your worktree). Your port is in your brief. Then `CPG_BASE_URL=http://localhost:<port> CPG_ADMIN_PASSWORD=integration-admin-password npm run test:integration -- tests/integration/<file>.test.ts`. Stop it by port when done (`lsof -ti tcp:<port> | xargs kill`).

## Finish

Commit on your branch in logical commits (`feat(<concept>): …`, ending with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Keep running notes in your tree `notes.md`. Report with `node "$CEZ_BIN" task report` listing: lists done (sort keys, search fields), forms converted, test files touched, the commands you ran with their exit codes, integration files run and results, anything you could not do. Never push, never open a PR.
