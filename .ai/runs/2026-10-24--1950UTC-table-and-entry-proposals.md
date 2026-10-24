# Three design proposals for tables and data entry

**Date:** 2026-10-24 19:50 UTC
**Agent:** Claude Code / Opus 5.5 (lead, cezar) with three parallel cezar workers
**Spec:** none (builds on `specs/implemented/2026-10-24--0842UTC-design-system-v1.md`)
**Status:** in progress

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

## Changes

- This run log and the briefs folder.

## Verification

## Follow-ups
