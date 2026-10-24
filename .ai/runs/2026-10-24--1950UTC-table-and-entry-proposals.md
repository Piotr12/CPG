# Three design proposals for tables and data entry

**Date:** 2026-10-24 19:50 UTC
**Agent:** Claude Code / Opus 5.5 (lead, cezar) with three parallel cezar workers
**Spec:** none (builds on `specs/implemented/2026-10-24--0842UTC-design-system-v1.md`)
**Status:** done

## Goal

Owner request: three distinct approaches to table presentation (sort on header click, search above the
table) and data entry (closed unit lists instead of free text, completion/suggestions). One GitHub issue
each, with screenshots of a mockup and a short TL;DR. The owner decides afterwards; no code is merged.

## Log

- 19:50 Read lessons, design system v1 spec, `DataTable`, `CrudForm`, `unitSchema` (free-text regex),
  material form fields. WebSearch and WebFetch were denied in this session (don't-ask mode), so the
  themes draw on known patterns of SAP Fiori, Shopify Polaris, IBM Carbon, GOV.UK / MOJ, GitHub Primer,
  AG Grid, Airtable and Linear rather than freshly fetched pages.
- 19:50 Themes, chosen to span effort and philosophy:
  - A "Quiet and honest" — URL/server-driven sortable headers, one search box, native grouped unit
    select, one ARIA autocomplete for long reference lists; no new dependency (S–M).
  - B "Workspace lists and value help" — filter bar with facet chips and counts, saved-view tabs, header
    menus, cmdk comboboxes, Fiori-style value help dialog, unit registry as master data (L).
  - C "Spreadsheet speed" — query bar with tokens, multi-sort, cell focus, ⌘K, inline grid entry,
    ghost-text completion, paste from Excel (XL).
- 19:50 Briefs in `.ai/pipeline/runs/2026-10-24--1950UTC-table-and-entry-proposals/` (common.md +
  one per theme); workers prototype in their own worktree, screenshot, upload to `qa-evidence`, file
  one issue each. Prototype branches stay local and are never merged.
- 20:08 A done: #217 (8 mockups, size M). Verified: all 8 raw image URLs answer 200, sections present,
  two PNGs viewed. Finding for whichever proposal wins: the realistic dataset uses 11 units, 4 of them
  (bag, bundle, case, spool) not in the brief's starter list; integration tests also use szt., płyta,
  lb, mil, mg — a closed unit list needs a backfill/migration plan for these. Worker also saw `next dev`
  keep serving an old core service after an edit (cached DI container) until restarted.
- 20:13 B done: #218 (10 mockups, size L, adds `cmdk`). Verified: all 10 raw image URLs answer 200,
  sections present, two PNGs viewed. Worker notes B's unit registry + combobox (its PR 1) stands
  alone and pairs with A's server-sorted headers; Escape inside its combobox closes the whole BOM
  dialog (documented in the issue as a risk).
- 20:14 C done: #219 (7 mockups, size XL). Verified: all 7 raw image URLs answer 200, sections
  present, two PNGs viewed (query bar with tokens, BOM inline lines with "did you mean kg?").
- 20:20 Posted the same side-by-side comparison comment on #217, #218 and #219; stopped the workers'
  dev servers on 3211–3213.

## Changes

- This run log and the briefs folder (`3ed9af24`).
- GitHub: issues #217 (A), #218 (B), #219 (C), label `enhancement`; screenshots on `qa-evidence`
  under `design-proposal-{a,b,c}/`; one comparison comment on each issue.
- Prototype code stays on local branches `cez/2e06d2cd` (A), `cez/b3637d29` (B), `cez/e5ffeeb8` (C),
  not pushed and not for merging. No product code changed on this branch.

## Verification

- `gh issue view` for each issue: all six sections present; every embedded raw URL answered HTTP 200
  (A 8, B 10, C 7 images); two PNGs per proposal viewed.
- No lint/test/build run: no product code changed here; prototypes are throwaway (tsc clean per the
  workers' reports).

## Follow-ups

- The owner picks A, B, C or a mix; the chosen direction then needs a spec (unit registry +
  backfill for the 11 realistic-dataset units and the test-only units; server-side sort/search).
- Unproven observation from worker A: `next dev` kept serving an old core service after an edit until
  restarted. Prove it (lesson 2026-10-23 "Prove a `next dev` problem") before recording a lesson.
