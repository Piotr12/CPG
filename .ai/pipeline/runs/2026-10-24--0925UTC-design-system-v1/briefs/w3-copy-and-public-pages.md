# W3 — Copy and public pages (design system v1, unit 3 of 8)

You are one worker in a lead-and-workers run that implements the CPG design system v1 spec as ONE pull request. The lead briefs, validates, merges and closes. You implement exactly this unit in your own worktree and branch and report back. W1 (tokens, focus, overlays) and W2 (`StatusBadge`, `Callout`, `PageHeader`, `Badge`/`Button`/`DataTable` contracts, `MammothMark`, the status tone map) are merged into the branch you were forked from. `tests/design-tokens.test.ts` scans the tree in report-only mode (`npx vitest run tests/design-tokens.test.ts`); never edit it.

## Source of truth

`.ai/specs/2026-10-24--0842UTC-design-system-v1.md`. Where this brief and the spec disagree, the spec wins; tell the lead.

Read first: `.ai/lessons.md` (all), `.ai/docs/engineering-standards.md`, then the spec's "Principles" (7), "Tokens and colour" (Rules; the migration rows for `app/src/app/page.tsx` and `help/page.tsx`), "Typography and numbers", "Spacing, radius and surfaces", "Layout and the page frame", "Components" (`MammothMark`, `Button`, Forms), "States and copy" (the table and the **Voice** table), "Decoration and the public pages", "Architecture → Compatibility", "Edge Cases" (`TENANT_READ_ONLY` matched by exact text), "Risks" (the copy slice changes strings tests assert), "Implementation Plan → W3 — Copy and public pages". Then `npm ci` in your worktree.

## Your row of the spec's Phasing table (verbatim)

| Unit | Order | Slices | Owns | Delivers |
|---|---|---|---|---|
| **W3** Copy and public pages | sequential, third | 8, plus the public pages of 9 | `packages/app/src/i18n/messages/**`, `packages/app/src/help/**`, `packages/core/src/domain/tenants/read-only.ts`, `packages/core/src/http/tenant-server-action.test.ts`, `packages/app/src/app/page.tsx` and `page.test.tsx`, `packages/app/src/app/help/**`, `packages/app/src/app/login/**`, `packages/app/src/app/layout.tsx` (the metadata only), `packages/app/src/app/admin/(global)/actions.ts` and its test, `packages/app/src/app/api/tenants/[tenant]/route.ts` (the comment), the "Cave control" assertions in `packages/app/src/app/admin/**/*.test.tsx`; integration `preferences`, `read-only`, `smoke`, `test-reset`, `help`, `auth`, `footer` | the Voice table in both languages; the home rebuild; Help's label and `@cpg/ui` controls; the login `h1` with the mark beside it; `metadata.description`; "active recipe" → "active BOM" |

Lead's refinements (recorded in the run folder's NOTIFY.md):
- You may change the one heading key in `packages/app/src/app/admin/[tenant]/page.tsx` from `admin.heading` to the new `admin.tenantHeading` (nothing else in that file), since you own its test's "Cave control — Prod" assertion and the spec's Voice table makes the two pages use different words.
- You may update any unit or integration test assertion, anywhere in the repo, that asserts the exact text of a string you change (the spec's Risks: "the slice updates them"), and nothing else in those files. List every such file in your report.
- `read-only.ts`'s refusal text is matched by exact text in screens and tests (lesson 2026-10-23): change `read-only.ts`, `en.ts` and `pl.ts` together, then run `packages/core/src/domain/tenants/read-only.test.ts`, `tenant-server-action.test.ts` and the `read-only` integration file.

## Spec sections you implement (by heading)

- **States and copy → Voice (decision D2, plain everywhere)**: every row of the table, in `en.ts` and `pl.ts` (`pl.ts` mirrors every key), `layout.tsx` metadata, `help/topics.ts`, `core/src/domain/tenants/read-only.ts`, the two comments. The product name, the footer sentence and `manifest.ts` `name` stay.
- **States and copy** (the table): Loading (the home and Help `min-h-96` fallbacks → `LoadingMessage`), Empty for Help ("No help topics match '{query}'." → "Show all topics"), Sign-in refusal ("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator."), and "Every new string lands in `en.ts` and `pl.ts`"; "One term per concept: BOM, not recipe": the production-orders empty state "active recipe" → "active BOM" (EN) and its Polish twin.
- **Decoration and the public pages**: the Home, Help and Login bullets, and "Public pages keep plain Tailwind on tokens and may use the `@cpg/ui` controls `Button`, `Input` and `Label`".
- **Tokens and colour → Hardcoded colours to migrate**: the rows `app/src/app/page.tsx:33`, `:36`, `:44,45,47,52` and `app/src/app/help/page.tsx:40,42`, `:47,57`, `:55`. (`manifest.ts:4` is the lead's.)
- **Typography and numbers**: Display `text-4xl` for the home `h1` only; the login card title becomes the page `h1` at `text-2xl font-semibold tracking-tight`; public body `text-base`; the tagline `text-lg`; `max-w-prose` on intros and Help topics; one `h1` per page; no skipped levels.
- **Spacing, radius and surfaces**: public page rhythm `px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12`; `16` (64 px) allowed on public pages only; no `rounded-2xl`, no `p-5`, no `px-2.5`.
- **Layout and the page frame**: Help and home at `max-w-3xl`; the sign-in card at `max-w-sm` (24rem); Help's search stacked below 640 px.
- **Components**: consume `MammothMark` (`packages/app/src/components/layout/mammoth-mark.tsx`, W2's) at 40 px on the home page and 20 px beside the login title; `Button asChild size="lg"` for the home CTA; `Label` + `Input` + `Button type="submit"` on Help; `Callout tone="danger" role="alert"` (`@cpg/ui/backend/feedback/callout`) for the sign-in refusal (one way to show a message).
- **Architecture → Compatibility**: help topic ids, routes and API shapes stay; topic titles, i18n strings and the `TENANT_READ_ONLY` text change in this PR with both translations.

## Implementation Plan steps for W3 (verbatim)

1. Apply the Voice table in `en.ts` and `pl.ts` (new `admin.tenantHeading`), `layout.tsx` metadata, `help/topics.ts`, `core/src/domain/tenants/read-only.ts`, the two comments; "active recipe" → "active BOM"; `en.ts:686` and its `pl.ts` twin to `Production orders — {tenant}`.
2. Rebuild `app/src/app/page.tsx` per Decoration (`MammothMark` 40 px, Display `h1`, plain tagline, `Button asChild size="lg"`, the flow of built capabilities as text links); Help gets `Label`, `Input`, `Button`; the login card title becomes the `h1` with the mark beside it.
3. Update the seven unit-test files that assert "Cave control", `page.test.tsx`, `login/page.test.tsx`, `help/page.test.tsx` and `messages.test.ts`; gate; run `preferences`, `read-only`, `smoke`, `test-reset`, `help`, `auth`, `footer`.

## The Voice table (verbatim) and its sites at `05a537f6`

| Where | Today | v1 |
|---|---|---|
| `en.ts` `home.tagline`, `layout.tsx:23` `metadata.description` | "MRP II. Because planning hard. Caveman try anyway." | "A small MRP II planning tool: it turns what customers want into plans for what to buy and what to make." (the sentence Help already uses) |
| `en.ts` `home.steps[].grunt`, `home.motto` | four caveman sentences, "Demand come. Caveman plan. Caveman make." | removed; the step names become the flow labels |
| `en.ts:21`, `pl.ts:19` login title | "🦣 Sign in to CPG" | "Sign in to CPG" (the mark is rendered beside it, not inside the string) |
| `en.ts:29` `admin.heading` (`/admin`) | "Cave control" | **"Tenants"** |
| tenant home (`admin/[tenant]/page.tsx:33` renders `admin.heading — {tenant}`) | "Cave control — Test" | **"Overview — Test"** (a separate `admin.tenantHeading` key, since the two pages no longer share a word) |
| `help/topics.ts:119-121`, `en.ts:1985`, `core/src/domain/tenants/read-only.ts:5` | "Cave control page" | "Tenants page" |
| `admin/(global)/actions.ts:22`, `api/tenants/[tenant]/route.ts:19` (comments) | "Cave control" | "Tenants" |
| the product name, the footer sentence, `manifest.ts` `name` | "Caveman Planning Good" | unchanged |

Sites found by grep (verify each; the lines may have moved): `packages/app/src/i18n/messages/en.ts:9,11-16,21,29,686,700,1986`; `pl.ts:7,9-14,19,27,653,667,1927`; `packages/app/src/help/topics.ts:119-121` and its Polish twin (`"admin-home"` at about line 414); `packages/core/src/domain/tenants/read-only.ts:5`; `packages/core/src/http/tenant-server-action.test.ts:130`; `packages/app/src/app/admin/(global)/actions.ts:22`, `actions.test.ts:40,92` (test titles); `packages/app/src/app/api/tenants/[tenant]/route.ts:19`; unit tests asserting "Cave control": `admin/[tenant]/page.test.tsx:50,69`, `admin/(global)/page.test.tsx:57`, `admin/(global)/audit/page.test.tsx:63`, `admin/(global)/tokens/page.test.tsx:49`, `help/page.test.tsx:28`; integration: `preferences.test.ts:64,107`, `read-only.test.ts:37,71,93`, `smoke.test.ts:40` (and its `li h2` list at :27), `test-reset.test.ts:12,53`; the login title appears in `auth.test.ts` and possibly `smoke`; `page.test.tsx:60` asserts the motto.

Polish: write natural, plain Polish for every new or changed string. Reuse the repo's existing terms: the tenant is "środowisko" (see `pl.ts`'s `TENANT_READ_ONLY` and the `nav`/`tenants` sections; use whatever word the sidebar already uses for the Tenants entry so the heading and the nav agree), the overview page "Przegląd", the tagline is the Polish sentence Help's "getting-started" topic already uses in `topics.ts`. "BOM" stays "BOM" in Polish (the `messages.test.ts` shared-words list says so).

## The public pages, exactly (spec "Decoration and the public pages")

- **Home** (`app/src/app/page.tsx`): `MammothMark` 40 px; `h1` "Caveman Planning Good" at Display (`text-4xl font-semibold tracking-tight`); the plain tagline at `text-lg text-muted-foreground max-w-prose`; one `<Button asChild size="lg"><Link href=…>` (Sign in / Open CPG, as today's logic decides); then a single flow of what is built as text links to their Help topics joined by `ArrowRight` icons (`aria-hidden`, 16 px): **Forecasts and customer orders → BOMs → Production and purchase orders → Stock**, wrapping vertically below `sm` (`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2`); the links are body links (`text-foreground underline underline-offset-4`), pointing at `/help#<topic id>` (pick the fitting ids from `HELP_TOPIC_IDS` in `help/topics.ts`: `forecasts`, `boms`, `production-orders`, and the stock topic); no cards, numbers or descriptions; no screenshot. The four `home.steps[].name` strings become those four flow labels (EN and PL); `grunt` and `motto` keys are removed from both dictionaries; keep the topic ids out of the dictionaries (they are not text). Keep `lang={locale}` and the request-time `Suspense` child; the fallback becomes `LoadingMessage`. Page rhythm per Spacing; no `zinc-*`.
- **Help** (`app/src/app/help/page.tsx`): `<Label htmlFor="help-q">` with the visible search label (`t.searchLabel`), `<Input id="help-q" type="search" name="q" …>` and `<Button type="submit">` at equal height (Input and default Button are both 32 px), stacked below 640 px (`flex flex-col gap-2 sm:flex-row sm:items-end`; the Label above the Input in a `flex flex-col gap-2` group); topics at `max-w-prose`; `text-zinc-500` → `text-muted-foreground`; `border-zinc-200 dark:border-zinc-800` → `border-border`; the "no match" copy and its next step follow the States table ("No help topics match '{query}'." → "Show all topics"; keep the existing keys if their text already complies, change the text if not); headings `h1` page, `h2` sections (`text-lg font-semibold`); the footer sentence is the layout's and is not yours. Fallback → `LoadingMessage`.
- **Login** (`app/src/app/login/`): the card title becomes the page `h1` at `text-2xl font-semibold tracking-tight` (render an `h1` inside `CardTitle`, or `CardTitle` with the heading element, so the page has exactly one `h1`), with `MammothMark` size 20 beside it (`flex items-center gap-2`); the string loses its emoji; the card stays `max-w-sm`; the sign-in refusal text becomes the States table's sentence in `en.ts` and `pl.ts` (find where the error text is produced: `login/actions.ts` or the dictionary) and renders as `<Callout tone="danger" role="alert">` in `sign-in-form.tsx` instead of the hand-styled `<p>`; the form keeps its visible `Label`s and the submitting state.
- **`layout.tsx`**: only `metadata.description` → the plain sentence. Nothing else in that file (P1 owns the rest).

## Rules (binding)

- Read `.ai/lessons.md` and `.ai/docs/engineering-standards.md` first; follow AGENTS.md. `npm ci` in your worktree.
- Tests next to the code; every line, branch and function you add or change is covered; `npm run test:coverage` stays at 100 % (never lower a threshold, widen an exclude or add a `v8 ignore`). `messages.test.ts` keeps EN/PL key parity and its "translate every string" list stays honest (add a path only for a word Polish genuinely shares, such as "BOMs" if you keep it).
- Gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, judged by exit codes, never by a piped tail (lesson 2026-10-23).
- Integration: exactly `preferences`, `read-only`, `smoke`, `test-reset`, `help`, `auth`, `footer` (`npm run test:integration -- tests/integration/<file>.test.ts`, one at a time), against a standalone server on port **3103** (Docker is unavailable; lesson 2026-10-23: copy `.next/standalone` into a new empty directory, add `.next/static` and `public`, run `node packages/app/server.js` with a fresh `DATA_DIR` from `mktemp -d`, `CPG_ADMIN_PASSWORD`, `KEEP_ALIVE_TIMEOUT=3600000`; tests with `CPG_BASE_URL=http://localhost:3103` and the same password). `test-reset` resets the Test tenant: run it last, and restart the server if a later file needs the tiny dataset. Stop the server by port when done.
- Browser check: screenshot `/`, `/help`, `/help?q=zzz` and `/login` (with a refused sign-in) at 320 and 1440 px, light and dark, EN and PL (set the language through the account's preferences, or read the `lang` behaviour from `preferences.test.ts`), into the run folder's `w3-artifacts/`. Polish labels must wrap, never clip; report anything that does.
- Read the scan's report-only output: `page.tsx`, `help/**`, `login/**` and the dictionaries must contribute no offenders (no emoji, no `zinc-*`, no `rounded-2xl`, no `p-5`).
- Commit on your branch with conventional messages (`feat(copy): plain voice in both languages (W3)`, `feat(public): home, Help and login on the design system (W3)` …). Do not amend after reporting.

## Prohibitions

- Nothing outside Owns (as refined). Other "recipe" strings in the dictionaries (`recipe: "BOM / revision"`, "Preview recipes", `PRODUCTION_NO_USABLE_BOM`…): do NOT change them; count them and list them under "Needs the lead" (the spec names only the empty state).
- No edits to the spec, to `tests/design-tokens.test.ts`, to `globals.css`, to `manifest.ts`, to `app-footer.tsx` or to any admin page beyond the one key swap above.
- No PR, no push to `main`, no merges or rebases.
- Report rather than work around.

## Report (through `cez task report`)

`--status done|partial|failed|blocked`; in `--result`/`--evidence`: files changed and tests changed or added (full lists, the cross-tree assertion updates marked); every gate command with its exit code; the coverage summary line; each of the seven integration files' result; the scan's total line before and after; screenshot paths and what they show (especially Polish wrapping at 320 px); the Polish wording you chose for the Voice rows; anything you could not do; "Needs the lead" (including the "recipe" string inventory).
