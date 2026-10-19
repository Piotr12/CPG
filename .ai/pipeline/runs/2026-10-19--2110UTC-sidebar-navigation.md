# Execution plan: a left sidebar with a Test | Prod switch and one master-data tree

**Date:** 2026-10-19 21:10 UTC
**Agent:** Claude Code / claude-opus-5-5. cezar → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--2048UTC-sidebar-navigation.md (merged on `main` via spec PR #59)
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

- Phase 2 (read-only display) while PR #57 is open: owner's scope decision, spec Q5.
- Placeholder entries for unbuilt slices (Q1), persisting the rail state (Q8), new pages, URL or access-rule changes.

## Risks

- Every page's frame changes, so every integration helper that touches the header must follow.
- The generated `sidebar.tsx` is large; 100 % coverage needs a test that exercises every export.
- Docker Desktop may belong to another macOS user (lessons): integration then runs against the standalone server with `CPG_BASE_URL`, and `startup-guard` is skipped.

## Implementation Plan

The spec's Implementation Plan, one Step per numbered item. Phase 2 runs only if #57 merges before Phase 1 is done.

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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Sidebar, switch and tenant header

- [x] 1.1 UI primitives — 77a760c
- [x] 1.2 Nav model and paths — b6b49cc
- [x] 1.3 Sidebar — b6b49cc
- [x] 1.4 Tenant header replaces the strip — b6b49cc
- [x] 1.5 Help, copy and standards — 95bf1c4
- [ ] 1.6 Integration

### Phase 2: Read-only display (after #57)

- [ ] 2.1 Lock on the switch
- [ ] 2.2 Banner
- [ ] 2.3 Integration
