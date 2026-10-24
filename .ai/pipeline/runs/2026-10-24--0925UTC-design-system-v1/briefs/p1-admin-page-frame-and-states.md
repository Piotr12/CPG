# P1 — Admin page frame and states (design system v1, parallel unit)

You are one of four workers running IN PARALLEL on disjoint file scopes (P1 pages and state pages; P2 document components; P3 master-data, stock, report and admin-tool components; P4 tenants and the navigation shell). The lead merges the four one at a time. W1 (tokens), W2 (`StatusBadge`, `Callout`, `PageHeader`, `Badge`/`Button`/`DataTable`, `MammothMark`, the tone map) and W3 (plain copy in both languages, the public pages, the `notFound`/`noscript`/`unexpectedError` strings) are merged into the branch you were forked from. `tests/design-tokens.test.ts` scans the tree in report-only mode (`npx vitest run tests/design-tokens.test.ts`); never edit it.

## Source of truth

`.ai/specs/2026-10-24--0842UTC-design-system-v1.md`. Where this brief and the spec disagree, the spec wins; tell the lead.

Read first: `.ai/lessons.md` (all), `.ai/docs/engineering-standards.md`, then the spec's "Typography and numbers" (one `h1` per page, rendered by `PageHeader`), "Spacing, radius and surfaces" (page padding), "Layout and the page frame" (the two widths, gutters, `PageHeader`), "States and copy" (Loading, Not found, Unexpected error, No JavaScript), "UI/UX → Screen archetypes", "Edge Cases" (`notFound()` answers 200; the error boundary has no deterministic trigger; the `<noscript>` notice sits in the static shell), "Implementation Plan → P1". Then `npm ci` in your worktree.

## Your row of the spec's Phasing table (verbatim)

| Unit | Order | Slices | Owns | Delivers |
|---|---|---|---|---|
| **P1** Admin page frame and states | parallel | 6 (pages), 10 | `packages/app/src/app/admin/**` except `(global)/page.tsx` and its test; `packages/app/src/app/layout.tsx` (the `<noscript>` notice and the sidebar fallback); `packages/app/src/app/not-found.tsx`, `admin/[tenant]/not-found.tsx`, `error.tsx`, `global-error.tsx` (all new); `tests/integration/not-found.test.ts` (new) | `PageHeader` on every admin page; the two widths; every Suspense fallback → `LoadingMessage`; the not-found and error pages; the notice |

Lead's refinements (recorded in the run folder's NOTIFY.md):
- **Where the `h1` lives decides who adopts `PageHeader`.** Pages whose `page.tsx` renders the `h1` are yours: `(global)/tokens`, `(global)/users`, `[tenant]/page.tsx` (Overview), `[tenant]/import`, `[tenant]/materials`, `[tenant]/materials/[id]`, `[tenant]/stock-import`. Every other page's `h1` is rendered by a screen component under `packages/app/src/components/**`, which P2 or P3 owns and converts; on those pages you change only the width, the padding and the fallback. Do not add a second `h1`.
- **`en.ts`/`pl.ts` are not yours.** W3 added `notFound.*`, `noscript` and `unexpectedError.*` (with `packages/app/src/i18n/messages/error-boundary.ts` for the client boundaries). If you need another string, report it; do not add it.
- **`layout.tsx`**: the `<noscript>` notice and the sidebar `Suspense` fallback only. `SidebarSkeleton` (in P4's `app-sidebar.tsx`) is a content-shaped, text-free placeholder and is not one of the blank `aria-busy` boxes: keep it. W3 already changed the metadata.
- **`global-error.tsx`** knows no locale (it replaces the root layout), so it shows the message in both languages, English first, like the `<noscript>` notice; `error.tsx` reads `document.documentElement.lang` and shows one language (English when it is not `pl`).

## Spec sections you implement (by heading)

- **Layout and the page frame**: two page widths (wide `max-w-6xl` for lists, reports and details with tables; narrow `max-w-3xl` for Tenants, Overview, users, tokens and single-form pages; `max-w-5xl` becomes wide; a detail page uses its list's width); gutters 16 px below 768 px and 24 px above; sections 24 px from the header, 32 px apart; the `PageHeader` bullet (title pattern `{Concept} — {Tenant}` on tenant pages, `{Concept}` on global pages, `{Concept singular} {ID}` on details).
- **Spacing, radius and surfaces**: page padding `px-6 pt-12 pb-12` at `md` and above, `px-4 pt-6 pb-8` below.
- **States and copy**: Loading ("Every `<Suspense>` fallback is `LoadingMessage` or a content-shaped skeleton built from it. The 23 blank `aria-busy` divs go"), Not found, Unexpected error, No JavaScript, each with its exact copy and component.
- **Typography and numbers**: one `h1` per page, rendered by `PageHeader`; `h2` for sections.

## Implementation Plan steps for P1 (verbatim)

1. Adopt `PageHeader` on every page under `app/src/app/admin/**` except `(global)/page.tsx`; map `max-w-5xl` to `max-w-6xl` and the narrow pages to `max-w-3xl`; every blank Suspense fallback to `LoadingMessage`.
2. `not-found.tsx` (root, tenant), `error.tsx`, `global-error.tsx` per the States table; the `<noscript>` notice in `layout.tsx` in both languages.
3. Unit tests (the layout asserts the notice in both languages; the error pages assert message, digest and `reset()`); `tests/integration/not-found.test.ts` (an unknown URL and an unknown record id, asserting the message, the way back and `noindex`); gate.

## Scope detail

- **Every `page.tsx` under `admin/**`** (except `(global)/page.tsx`): `<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">` (or `max-w-3xl` for Overview, users, tokens), the `Suspense` fallback `<LoadingMessage />` (`@cpg/ui/backend/feedback/loading-message`). Widths at `05a537f6`: `max-w-5xl` on `(global)/audit`, `[tenant]/audit`, `customers`, `locations`, `suppliers`, `materials`, `materials/[id]` → `max-w-6xl`; `max-w-3xl` stays on `[tenant]/page.tsx`, `users`, `tokens`; everything else is already `max-w-6xl`. Remove a `gap-*` from `main` where it only separated the header from the content: the rhythm comes from `PageHeader`'s `mb-6` and from a `flex flex-col gap-8` wrapper around the sections inside the request-time child.
- **Pages whose `h1` you own** become `<PageHeader title={…} description={…} actions={…} />` (`@cpg/ui/backend/page-header`) followed by the sections. Titles follow the pattern: Overview is `messages.admin.tenantHeading` filled with the tenant (W3 made it "Overview — Test"); `materials` is the existing heading function; the material detail's title is the record (`{Concept singular} {ID}`: keep the existing `detailHeading` text; drop `wrap-anywhere` on the title only if the ID never needs it, otherwise keep it on the title node); `import`/`stock-import` keep their headings; intros that exist today become the `description`. Existing page-level actions (a Create button, links) move into `actions`. Behaviour, data flow and the `requireUser()`/`requireAdmin()` gates stay exactly where they are (`tests/admin-pages-require-admin.test.ts` must keep passing).
- **`not-found.tsx` (root, `packages/app/src/app/not-found.tsx`)**: a server component inside the shell, request-time (`await connection()` inside `<Suspense fallback={<LoadingMessage />}>`), reading `getMessages()`; `<main>` at the narrow width, an `EmptyState` with `title={t.notFound.title}` and the description, and the next step **Go to Tenants** as `<Button asChild variant="outline"><Link href="/admin">`; `export const metadata: Metadata = { title: "Page not found · Caveman Planning Good", robots: { index: false } }` (check `node_modules/next/dist/docs/` for `not-found` metadata support in this Next version; if the file cannot export metadata, render `<meta name="robots" content="noindex">` the documented way and say so). `lang={locale}` on the content.
- **`admin/[tenant]/not-found.tsx`**: the same message inside the tenant layout (the tenant header stays visible), with **Back to {list}**: a small client component in the same folder reads `usePathname()` and the nav tree (`trailOf`/`TENANT_TREE` from `components/layout/nav-tree.ts`, import only) to find the list the URL belongs to and its label from `messages.nav`, and links to it; when no section matches, **Back to Overview — {tenant}** (`t.notFound.backToOverview`). Both are `EmptyState` + an outline `Button asChild` link.
- **`error.tsx`** (`"use client"`): `({ error, reset })`; picks `ERROR_BOUNDARY[lang]` from `packages/app/src/i18n/messages/error-boundary.ts` by `document.documentElement.lang` (`pl` or `en`); renders an `ErrorMessage` (`@cpg/ui/backend/feedback/error-message`) holding the title and the description with `{digest}` replaced by `error.digest ?? "—"`, and a `<Button onClick={() => reset()}>` with the retry label, inside `<main>` at the narrow width. **`global-error.tsx`**: `<html lang="en"><body>` with `./globals.css` imported so tokens apply, the same message in English and Polish (two paragraphs, `lang` on each), the digest and the Try again button; minimal markup, no sidebar.
- **`layout.tsx`**: inside `<body>`, before the providers, `<noscript>` holding warning-`Callout` markup (import `Callout` from `@cpg/ui/backend/feedback/callout` and render it inside `<noscript>`; React renders `noscript` children as static HTML on the server) with two paragraphs, `<p lang="en">{en.noscript}</p>` and `<p lang="pl">{pl.noscript}</p>`, imported from the dictionaries directly (the shell knows no locale). Its unit test asserts both sentences are in the markup.
- **Tests**: every page test you touch keeps asserting behaviour (the heading text, the gate, the actions); new tests for the four state files (the not-found pages: message, link target, `noindex`; the error pages: message, digest, `reset()` called on Try again; the layout: both notice sentences). `tests/integration/not-found.test.ts`: open an unknown URL (`/this-page-does-not-exist`) and an unknown record (`/admin/test/materials/99999999` after signing in; see `tests/integration/sign-in.ts` and `browser.ts`), assert the message text, the way back (link text and `href`) and `<meta name="robots" content="noindex">` (lesson 2026-10-19: `notFound()` answers HTTP 200 under Partial Prefetching, so do not assert the status); give the file its own `--session`.

## Rules (binding)

- Read `.ai/lessons.md` and `.ai/docs/engineering-standards.md` first; follow AGENTS.md. `npm ci` in your worktree.
- Tests next to the code; 100 % coverage of your changes (`npm run test:coverage`); never lower a threshold, widen an exclude or add a `v8 ignore`.
- Gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, judged by exit codes, never by a piped tail (lesson 2026-10-23). `tests/every-page-has-help.test.ts` and `tests/admin-pages-require-admin.test.ts` must keep passing (your new files are not `page.tsx`).
- Integration: `npm run test:integration -- tests/integration/not-found.test.ts` only, against a standalone server on port **3111** (Docker is unavailable; lesson 2026-10-23: copy `.next/standalone` into a new empty directory, add `.next/static` and `public`, run `node packages/app/server.js` with a fresh `DATA_DIR` from `mktemp -d`, `CPG_ADMIN_PASSWORD`, `KEEP_ALIVE_TIMEOUT=3600000`; tests with `CPG_BASE_URL=http://localhost:3111` and the same password). Stop it by port when done.
- Browser check: screenshot the Overview, the Materials list cold-load frame (the `LoadingMessage` fallback) and the two not-found pages at 320 and 1440 px, light and dark, into the run folder's `p1-artifacts/`; disable JavaScript once (agent-browser or Chrome's `--disable-javascript` through the CDP `Emulation.setScriptExecutionDisabled`, whichever `tests/integration/browser.ts` lets you reach) and screenshot the notice. Report anything that clips.
- Read the scan's report-only output: your files contribute no offenders.
- Commit on your branch with conventional messages (`feat(admin): PageHeader, two widths and LoadingMessage on every admin page (P1)`, `feat(app): not-found, error and no-JavaScript states (P1)`). Do not amend after reporting.

## Prohibitions

- Nothing outside Owns (as refined): no edits under `packages/app/src/components/**`, no dictionary edits, no edits to `(global)/page.tsx`, to the spec, to `tests/design-tokens.test.ts` or to `globals.css`.
- No PR, no push to `main`, no merges or rebases.
- Report rather than work around (a page whose `h1` belongs to a component goes in "Needs the lead" with the component's path if you think it needs a page-side change too).

## Report (through `cez task report`)

`--status done|partial|failed|blocked`; in `--result`/`--evidence`: files changed and tests added (full lists); every gate command with its exit code; the coverage line; the integration result; the scan's total line before and after; screenshot paths; the list of pages per width; anything you could not do; "Needs the lead".
