# Execution plan: a left sidebar with a Test | Prod switch and one master-data tree

**Date:** 2026-10-19 21:10 UTC
**Agent:** Claude Code / claude-opus-5-5. cezar → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/implemented/2026-10-19--2048UTC-sidebar-navigation.md (merged on `main` via spec PR #59; moved to `implemented/` by this PR)
Issue: #58

## Goal

Replace the top bar and the tenant strip with the sidebar of mockup 01: a full-width TEST | PROD switch that keeps the current screen, the tenant's screens with Master data as one tree, the shared screens and an account card pinned to the bottom, an icon rail on desktop and a drawer below 768 px. A tenant header row (tag, tenant-coloured top edge, section trail) carries TEN-011 on every admin page.

## Scope

- `packages/ui`: shadcn `sidebar`, `collapsible`, `breadcrumb` (plus what `sidebar` brings: `tooltip`, `separator`, `skeleton`, `input`, `hooks/use-mobile`), the `./hooks/*` export, the marked edit to `sidebar.tsx` (no cookie, translated labels as props), tests.
- `packages/app`:
  - `components/layout/`: `nav-tree.ts` (new, dependency-free), `nav-items.ts` → `navModel`, `current-path.ts`, `app-sidebar.tsx`, `sidebar-nav.tsx`, `account-panel.tsx` (drops `inline`); deletes `app-bar.tsx`, `nav-menu.tsx`;
  - `components/tenants/`: `switch-tenant-path.ts`, `tenant-switch.tsx`, `tenant-header.tsx`; deletes `tenant-strip.tsx`, `tenant-switcher.tsx`, `tenant-switch-links.tsx`;
  - root, `(global)` and `[tenant]` layouts; i18n (en, pl); help topics.
- `.ai/docs/engineering-standards.md` section 2 step 7 (public-page shadcn exception).
- Tests: unit tests next to every changed file; `tests/integration/navigation.test.ts` rewritten; `sign-in.ts`, `tenants.test.ts`, `preferences.test.ts` follow the new frame.

## Non-goals

- Placeholder entries for unbuilt slices (Q1), persisting the rail state (Q8), new pages, URL or access-rule changes.

## Risks

- Every page's frame changes, so every integration helper that touches the header must follow.
- The generated `sidebar.tsx` is large; 100 % coverage needs a test that exercises every export.
- Docker Desktop may belong to another macOS user (lessons). It didn't on this run: the integration suite ran in Testcontainers.

## Implementation Plan

The spec's Implementation Plan, one Step per numbered item. Phase 2 ran because #57 merged (af2796a, 21:39 UTC) while Phase 1 was finishing; the owner asked for it in this PR (spec Q5). `origin/main` was merged in (0fac09b), not rebased, because the branch was already pushed.

## Deviations from the spec

- `use-mobile.ts` is rewritten on `useSyncExternalStore`: the generated hook set state inside an effect, which `react-hooks/set-state-in-effect` rejects. Same contract (false on the server, then whether the viewport is under 768 px).
- The root layout wraps the provider in shadcn's `TooltipProvider`: this `radix-nova` sidebar's tooltips need one and the generated provider doesn't add it.
- `VisitorBar` is its own client file (`visitor-bar.tsx`), because it marks the open link with `usePathname()`.
- The drawer closes on a path change through an effect, not by adjusting state while rendering: its state belongs to `SidebarProvider`, and setting another component's state during render is an error. Links also close it on click, so following one is immediate.
- Menu isn't the sheet's own Radix trigger, so the sheet can't return focus to it. `SidebarNav` focuses Menu when the drawer closes.
- New strings beyond the spec's list: `nav.roles` (the account card's role line), `nav.menuShows` (Q7's "Menu shows: Test"), `nav.trail` (the trail's accessible name), and `tenants.header` (the row's words). `nav.tenants`, `nav.audit` and `tenants.strip` are removed.
- The account card's popover holds API tokens as a link in `AccountPanel`; `TOKENS_PATH` lives in the dependency-free `nav-tree.ts`.
- `footer.test.ts` changes: the footer now ends the content column beside the sidebar, so "nothing comes after it" is checked against every shown element instead of `<body>`'s children.
- `data-signed-in-as` on the mobile top bar tells integration helpers who is signed in at every width (the account card is only in the DOM once the drawer opens below 768 px).

## Verification

Full gate on 62a8850 (Phase 1 + Phase 2, `origin/main` with #57 merged in), Docker available, so integration ran in Testcontainers against the production image:
- `npm run lint`: pass. `npm run typecheck`: pass.
- `npm run test:coverage`: 212 files, 1368 tests passed; 100 % statements, branches, functions and lines.
- `npm run build`: pass.
- `npm run test:integration`: 20 files, 145 tests passed, none skipped (`startup-guard` included).
- Visual check on the standalone server at 1280 px (expanded, rail with the Master data fly-out, Prod) and 390 px (top bar, drawer).

## Phase 2 notes

- #57's read-only label on the tenant strip and its `tenants.readOnlyStrip` string went away with the strip. The lock on the switch, the caption and the banner replace them. The chooser's Read-only badge, the admin's Read-only card, the hidden write controls and the `TENANT_READ_ONLY` refusal are #57's and unchanged.
- The switch names a read-only side with `aria-label` ("Prod (read-only)"), not a visually hidden span: jsdom drops the space (see lessons), and the visible tenant name stays first.
- New strings: `nav.readOnly`, `nav.readOnlyCaption`, `nav.readOnlyBanner` (title, text, change). The `admin-home` and `test-and-prod` help topics describe the lock and the banner.
- `AppSidebar` and `ReadOnlyBanner` read the global tenant metadata through a plain `requestScope()`, as #57's strip did; neither opens a tenant scope.

## Progress

PR: #60

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Sidebar, switch and tenant header

- [x] 1.1 UI primitives — 77a760c
- [x] 1.2 Nav model and paths — b6b49cc
- [x] 1.3 Sidebar — b6b49cc
- [x] 1.4 Tenant header replaces the strip — b6b49cc
- [x] 1.5 Help, copy and standards — 95bf1c4
- [x] 1.6 Integration — 94e195f, 043a316, 9ed66a8

### Phase 2: Read-only display (after #57)

- [x] 2.1 Lock on the switch — 62a8850
- [x] 2.2 Banner — 62a8850
- [x] 2.3 Integration — 62a8850
