# Menu revamp — five clickable mockups

**Date:** 2026-10-19 20:18 UTC
**Agent:** Claude Code / Opus 5.5 (cezar task 774d80cf), five parallel subagents for delivery
**Spec:** none (exploration ahead of a spec); builds on `.ai/specs/2026-10-19--1312UTC-navigation-menu.md` (#43, implemented)
**Status:** done

## Goal

Five static, clickable HTML mockups of a revamped app menu, each in its own folder, covering what is on `main`, #23 (locations, customers, suppliers) and #25 (read-only tenants) in progress, and the later epics (E03-S03, E04, E05, E06 slices 2–3). Owner's constraints: Test/Prod is a switch, not a menu entry; master data is one menu tree; easy to understand, few clicks. End state: instructions to review them locally.

## Log

- 20:18 — Read the current menu (`components/layout/nav-items.ts`, `nav-menu.tsx`, `app-bar.tsx`, tenant strip/switcher), the routes under `app/admin`, the navigation-menu spec, the product brief and issues #10–#14, #23–#27. #23 and #25 exist only as empty spec drafts in sibling worktrees, so the mockups use the issues' acceptance criteria.
- 20:18 — Current menu: `Tenants · Test · Prod · Audit · API tokens · Users · Help` in the bar, a tenant strip with a Test/Prod switcher below it, materials and the tenant audit reachable only from the tenant home card, system status on `/admin`.
- 20:18 — Picked five deliberately different approaches: (1) classic left sidebar tree, (2) top bar with mega-menu + section tabs, (3) launcher home + command palette, (4) process-flow navigation following the planning loop, (5) icon rail + contextual panel with a mobile bottom tab bar. Wrote the shared IA and conventions in `.ai/specs/assets/menu-revamp/BRIEF.md` so the five stay comparable.

- 20:20 — Dispatched five general-purpose subagents in parallel, one folder each, with the brief, the current-look references and a browser self-check (agent-browser: routes, Test→Prod, read-only, normal-user role, 390 px overflow, JS errors), plus desktop/mobile preview screenshots.
- 20:30–20:37 — All five reported done. While self-checking they fixed their own bugs: 05 had the Admin icon visible to normal users (CSS overrode `hidden`), a `#/prod/…` deep link showed Test, and rail labels broke mid-word; 03 had 471 px overflow at 390 px from the later-slice cards and noisy 2-letter search. Reviewed every desktop preview and two mobile previews by eye.
- 20:37 — Wrote the comparison page (`index.html`: cards with screenshots, pros/cons, a click-count table) and `README.md` with the review instructions.

## Changes

- `.ai/specs/assets/menu-revamp/BRIEF.md` — shared IA (current, #23, #25, slice 1 stories, slices 2–3), sample data, conventions.
- `.ai/specs/assets/menu-revamp/{01-sidebar-tree,02-top-megamenu,03-launcher-command,04-process-flow,05-rail-and-panel}/` — `index.html` (self-contained, hash-routed, ~70–80 KB) plus `preview-desktop.png` and `preview-mobile.png`.
- `.ai/specs/assets/menu-revamp/index.html`, `README.md` — comparison page and review instructions.
- No product code changed.

## Verification

- agent-browser, my own pass over all five: `#/test/materials`, `#/prod/locations`, `#/global/users`, `#/test/safety-stock` each render the expected `<h1>` at 1280×800 with no horizontal overflow; at 390×844 `scrollWidth` = 390 in all five.
- `grep` for external `src`/`href`/`@import`: the only outside links are the two footer links, so the mockups work offline from `file://`.
- The comparison page loads all 10 thumbnails (`naturalWidth > 0`), checked on a screenshot.
- `vitest run tests/ai-filenames.test.ts`: 4/4 pass (`assets/` is exempt from the timestamp rule; the run log follows it).
- The click counts in `index.html` are as each designer reported them. I didn't re-count every path by hand.
- Lint, typecheck, coverage, build and integration tests were not run: nothing under `packages/` changed.

## Follow-ups

- The owner picks a concept (or a mix). That becomes a spec superseding the layout parts of `.ai/specs/2026-10-19--1312UTC-navigation-menu.md` (#43, already built). It should be timed with #23/#25 landing, since both add menu entries and the read-only lock.
