# P3 — Master data, stock, reports, admin tools (design system v1, parallel unit)

You are one of four workers running IN PARALLEL on disjoint file scopes (P1 admin pages and state pages; P2 document components; P3 master-data, stock, report and admin-tool components; P4 tenants and the navigation shell). The lead merges the four one at a time. W1 (tokens), W2 (`StatusBadge`, `Callout`, `PageHeader`, `Badge`/`Button`/`DataTable` contracts, `CrudForm` error styling, the status tone map in `components/document-lifecycle/status-tone.ts`) and W3 (plain copy) are merged into the branch you were forked from. `tests/design-tokens.test.ts` scans the tree in report-only mode (`npx vitest run tests/design-tokens.test.ts`); never edit it.

## Source of truth

`.ai/specs/2026-10-24--0842UTC-design-system-v1.md`. Where this brief and the spec disagree, the spec wins; tell the lead.

Read first: `.ai/lessons.md` (all), `.ai/docs/engineering-standards.md`, then the spec's "Principles" (3, 4, 6), "Tokens and colour" (Rules; the migration rows for `imports/import-screen.tsx:293`, `api-tokens/token-secret-panel.tsx:55`, `boms/bom-screen.tsx:115`), "Typography and numbers", "Layout and the page frame" (`PageHeader`, `DataTable`), "Components" (`StatusBadge`, Status tone map, `Callout`, `PageHeader`, Forms), "States and copy" (Empty, Section error, Page-open error, Validation refusal, Success), "UI/UX → Screen archetypes" (Master-data list, Form or dialog, Import, Report), "Implementation Plan → P3". Then `npm ci` in your worktree.

## Your row of the spec's Phasing table (verbatim)

| Unit | Order | Slices | Owns | Delivers |
|---|---|---|---|---|
| **P3** Master data, stock, reports, admin tools | parallel | 4, 5, 6 (components) and 7 (apply) for the rest | `packages/app/src/components/{materials,named-records,master-data,boms,planning-parameters,safety-stock,stock,reports,imports,api-tokens,audit,users,preferences,forms}/**`; integration `materials`, `named-records`, `boms`, `planning-parameters`, `import`, `stock-import`, `stock`, `stock-reversals`, `stock-report`, `variance-report`, `audit`, `audit-history`, `users`, `api-tokens` | `StatusBadge` for materials, named records, BOMs, users, safety stock and the audit table; `Callout` in `bom-screen`, `token-secret-panel`, `import-screen`; `kind` / `priority` on every table here; "Back to …" links removed |

Lead's refinements (recorded in the run folder's NOTIFY.md):
- **`PageHeader` in your screen components.** These pages' `h1` is rendered by your components, so you convert them to `<PageHeader title meta description actions>` (`@cpg/ui/backend/page-header`): `named-records/named-records-screen.tsx`, `planning-parameters/planning-parameters-screen.tsx`, `audit/audit-view.tsx`, `safety-stock/safety-stock-screen.tsx`, `boms/boms-screen.tsx`, `boms/bom-screen.tsx` (the record as the title, its status as `meta`), `stock/stock-screen.tsx`, `reports/stock-report-screen.tsx`, `reports/variance-report-screen.tsx`. The materials, import, stock-import, users and tokens pages render their `h1` in `page.tsx` (P1 converts those). Your component renders the header and then its sections in a `flex flex-col gap-8` wrapper. One `h1` per page.
- **Dictionaries.** `en.ts`/`pl.ts` belong to no parallel unit, but you may add keys ONLY inside your own concepts' sections (`materials`, `locations`, `customers`, `suppliers`, `boms`, `planningParameters`, `safetyStock`, `stock`, `stockImport`, `import`, the report sections, `audit`, `users`, `tokens`, `preferences`), in both languages, and you never touch `messages.test.ts` (choose a Polish translation that differs from the English). List every key you add in your report.
- **"Back to …" links stay for now.** P4 is making the section trail link its ancestors and show the record at the same time as you work, so you cannot verify the trail at 320 px. Leave any "Back to …" list links in your folders; the lead removes them after P4 merges and checks the trail.
- **From W2's report**: `users/set-active-dialog.tsx` and `api-tokens/revoke-token-dialog.tsx` build their own `AlertDialog` with `variant="destructive"` on the confirm button; per the spec the confirm button inside an `AlertDialog` is `destructive-solid` (the opener stays `destructive`), and the `users` and `api-tokens` integration selectors (`button[data-variant=destructive]`) move with them. `DataTable`'s sticky first column is `bg-background`, so keep tables on the page background (the spec says so anyway), never inside a Card. `ErrorMessage` now renders a `div` (icon + text), not a `p`: don't nest it in a `p`. Import paths: `@cpg/ui/backend/feedback/status-badge`, `@cpg/ui/backend/feedback/callout`, `@cpg/ui/backend/page-header`; tone accessors in `components/document-lifecycle/status-tone.ts` (`masterDataStatusTone(active)`, `targetStatusTone(status)`, `reversalStatusTone("reversed")`, `tenantAccessTone(readOnly)`), each returning `{ tone, icon, dashed? }` to spread into `StatusBadge`; `DataTable` columns take `kind`, `priority`, `truncate(row)`; the table takes `rowTone(row)`.
- **`forms/**`**: `form-labels.ts` (`TALL_DIALOG`, `errorFormatter`, `fill`) and `line-quantities-form.tsx` are shared by P2's dialogs. Change them only for token, radius and spacing compliance and the error presentation (icon + `text-danger`), never their props or behaviour; report anything more.

## Spec sections you implement (by heading)

- **Components**: `StatusBadge` fed by the tone map (`masterDataTone(active)` for materials, named records, BOMs and users: Active → neutral `Circle`, Inactive → neutral dashed `CircleOff`; `safetyStockTone` for targets: In effect → success, Scheduled → neutral `Clock`, Superseded → neutral `History`; the audit table's row state badges; the `destructive` Inactive badges go); `Callout` for the migrated boxes and for messages; `PageHeader`; Forms (visible labels, help text, the error presentation through `CrudForm`, which W2 did; search and filter forms keep submitted and invalid values, show the active scope and offer a reset; a `<select>` whose URL value matches no option adds it as its own option: audit the report and audit filters against this and fix what does not comply).
- **Tokens and colour → Hardcoded colours to migrate**: `app/src/components/imports/import-screen.tsx:293` (`border-green-600/30 bg-green-600/10` → `<Callout tone="success" role="status">`), `app/src/components/api-tokens/token-secret-panel.tsx:55` (→ `<Callout tone="warning" title="Copy this token now">`, the title string in both languages), `app/src/components/boms/bom-screen.tsx:115` (→ `<Callout tone="warning" role="note">`); `preferences/preferences-controls.tsx:47`'s `text-destructive` alert → `ErrorMessage`; any other `text-destructive`/`bg-destructive/…` in your folders → the danger tone through `ErrorMessage`, `Callout` or `text-danger`.
- **Layout and the page frame → `DataTable`**: every table in scope gets `kind` and `priority`, the ID column first (sticky).
- **Typography and numbers**: quantities right-aligned `tabular-nums` (the `quantity` kind; the stock and variance reports especially), IDs `font-mono` (the `id` kind), dates ISO, `—` with `aria-label="none"` for empty values; weights 400/500/600.
- **Spacing, radius and surfaces**: `0.5`/`1.5` in `packages/app` → `1` or `2`; `p-5`/`px-5` → `4`; `pl-7` → `pl-8`; in-page boxes `rounded-md`, cards `rounded-lg`; no card inside a card; tables not in a Card.
- **States and copy**: Empty states with the next step ("No materials yet." → a Create material action for a writer, "Ask an administrator to add materials." for a reader or a read-only tenant; filtered-empty → "Clear filters"); Section error "Could not load materials. Try again." where a section can fail; Success as `Callout tone="success" role="status"` without duplicate panels (the import's one authoritative result per stage); Validation refusal beside the field plus the summary.
- **UI/UX → Screen archetypes**: Master-data list (tenant header → `PageHeader` with the allowed create action → labelled filters → `DataTable` → pagination or empty state); Import (numbered steps tied to actual completion: template → dry run → commit); Report (title → labelled scope and date filters → table → links to source records; units and scope stay visible).

## Implementation Plan steps for P3 (verbatim)

1. `StatusBadge` for materials, named records, BOMs, users, safety stock and the audit table (including the `destructive` Inactive badges), fed by the tone map.
2. `bom-screen.tsx:115`, `token-secret-panel.tsx:55` and `import-screen.tsx:293` to `Callout`, keeping `role` and children.
3. `kind` and `priority` on every table in scope; "Back to …" links removed where the trail keeps the list reachable.
4. Unit tests; gate; run the integration files in scope.

## Scope detail

- Status `Badge`s to convert (find every `Badge` in your folders): `materials/materials-table.tsx`, `named-records/named-records-table.tsx`, `boms/boms-table.tsx`, `boms/bom-screen.tsx:52`, `boms/recipe-table.tsx`, `users/users-table.tsx`, `safety-stock/safety-stock-table.tsx:44`, `audit/audit-table.tsx`, `planning-parameters/planning-parameters-table.tsx`, `master-data/references.tsx`, `stock/reversal-controls.tsx`, `reports/variance-report-screen.tsx`, `imports/import-screen.tsx`. A status (active/inactive, in effect/scheduled/superseded, reversed, import row outcome) becomes `StatusBadge`; a category (material type, migration counts, role names, "Generation 1") stays `Badge`.
- Materials detail: the status as the header's `meta` is P1's (the `h1` is in its `page.tsx`); if the material screen component you own renders the status badge, feed it from the tone map and tell P1's page nothing (the lead reconciles at merge).
- Tables at 320 px: the container scrolls, the ID column is sticky, the page never scrolls sideways; assert overflow in your integration files where they already check layout (lesson 2026-10-20).
- Tests: every `*.test.tsx` in your folders asserts the badge's label and tone (`data-tone`), the callouts' tone and role, the `h1`, the empty state's next step; coverage stays 100 %.

## Rules (binding)

- Read `.ai/lessons.md` and `.ai/docs/engineering-standards.md` first; follow AGENTS.md. `npm ci` in your worktree.
- Tests next to the code; 100 % coverage of your changes; never lower a threshold, widen an exclude or add a `v8 ignore`.
- Gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, judged by exit codes, never by a piped tail (lesson 2026-10-23). Page tests under `app/src/app/admin/**` (P1's) that render your components must keep passing; if one asserts a class or text you change, report it instead of editing it.
- Integration: exactly your fourteen files, one at a time, against a standalone server on port **3113** (Docker is unavailable; lesson 2026-10-23: copy `.next/standalone` into a new empty directory, add `.next/static` and `public`, run `node packages/app/server.js` with a fresh `DATA_DIR` from `mktemp -d`, `CPG_ADMIN_PASSWORD`, `KEEP_ALIVE_TIMEOUT=3600000`; tests with `CPG_BASE_URL=http://localhost:3113` and the same password). Update the assertions your change affects. Stop the server by port when done.
- Browser check: on the realistic dataset (Reset Test with the realistic dataset through the Tenants page, `[data-test-reset] select`; lesson 2026-10-23), screenshot the Materials list (populated), a BOM detail, the import screen with a refusal (upload a workbook with an invalid row; see `tests/integration/import.test.ts` for how), the stock report and the audit list at 320, 768 and 1440 px, light and dark, EN and PL, into the run folder's `p3-artifacts/`. Polish labels must wrap, never clip or shrink; a tall dialog (planning parameters create) must scroll internally with reachable actions (`TALL_DIALOG`); report anything that fails.
- Read the scan's report-only output: your folders contribute no offenders.
- Commit on your branch with conventional messages (`feat(master-data): StatusBadge, Callout and PageHeader on master-data, stock, report and admin screens (P3)` …). Do not amend after reporting.

## Prohibitions

- Nothing outside Owns (as refined): no `status-tone.ts` edits (report a missing state), no `packages/ui` edits (report a gap), no page edits, no edits to the spec, `tests/design-tokens.test.ts` or `globals.css`.
- No "Back to …" removals (see above). No new routes, API changes, business-rule changes or number-format changes.
- No PR, no push to `main`, no merges or rebases.
- Report rather than work around.

## Report (through `cez task report`)

`--status done|partial|failed|blocked`; in `--result`/`--evidence`: files changed and tests changed (full lists); dictionary keys added; every gate command with its exit code; the coverage line; each integration file's result; the scan's total line before and after; screenshot paths and what they show; anything you could not do; "Needs the lead".
