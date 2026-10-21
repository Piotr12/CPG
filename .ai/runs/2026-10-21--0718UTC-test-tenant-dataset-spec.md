# Spec and issue: a realistic Test tenant dataset

**Date:** 2026-10-21 07:18 UTC
**Agent:** Claude Code (Claude Fable 5.1) via cezar, headless
**Spec:** `.ai/specs/2026-10-21--0718UTC-test-tenant-dataset.md` (written by this run)
**Status:** in progress

## Goal

The owner asked (through `/om-discover`, but explicitly without an intermediate brief) for a spec and a GitHub issue that links it, defining a realistic Test tenant dataset: two years of monthly shipment history, a year of monthly forecasts, 4 manufacturing locations, 10 customers, 10 finished products (5 raw-only, 5 built from 4 intermediates plus raw), one active BOM each except one simple product with 3 prioritised alternates, safety stock, inventories, open customer and purchase orders, with the shape numbers hardcoded in a `test-tenant-config.json`.

## Log

- 07:18 Read `.ai/lessons.md`, the engineering standards, `SDLC.md`, the product brief (D06, R09, R05), the test-prod-tenants spec (seeder contract Q4), the atomic Test reset (`TestResetService`, `seedResetDemoData`), every `demo-*.ts` fixture and every `seedDemo()` implementation, the business entities, `postStockMovements` (business date = today, channel `seed` exists), the document services' posting paths, `BACKWARD_COMPATIBILITY.md` §4 (reset route), and the issue format of #89/#93/#94.
- 07:18 Decision: no `product-brief.md` refresh (owner's explicit request). The deliverable is the spec plus an FR issue, landed as a design-only PR per `SDLC.md`.
- 07:18 Key design tension found: every actual posting is dated today (R09, INV-010), while two years of history needs backdated goods issues, receipts and completions. Resolution proposed in the spec: a seed-only posting context carrying the historical business date, refused for any user channel.
- 07:18 Second finding: the startup seeder fills "each kind Test has none of" row by row. With an interdependent generated dataset that would seed inconsistent fragments into an edited Test. The spec proposes all-or-nothing: seed only an untouched Test; the reset regenerates.
- 09:30 Spec drafted (catalogue of 4 plants, 10 customers, 6 suppliers, 26 materials, 16 BOMs, 15 made pairs; demand/supply model; what is open today; config file shape; phased plan). `tests/ai-filenames.test.ts` and `tests/spec-images.test.ts` pass (6 tests). Fresh-context skeptical review dispatched.
- 09:40 Own fix before the review returned: the day ranges let a shipment precede the completion that supplies it. Replaced with disjoint ordered bands (receipts weekdays 1–3, intermediate completions 4–6, finished completions 7–9, shipments 10–20), which makes non-negativity hold by construction under order-up-to planning.
- 09:50 Review returned 1 critical, 4 high, 6 medium, 12 low. Critical (non-negativity) already fixed by the bands. Applied: documents created a month ahead (customer orders weekday 12+ of the previous month, purchasing run weekday 2, production planning run weekday 8) so open documents exist every day; requisitions sized to the converting line (the PO service refuses over-conversion); the reset's lock window named as an owner decision (Q16: no busy timeout configured, better-sqlite3 default 5 s, other bundles' writes block then fail); counts corrected (32 raw buy pairs + 1 = 33, 48 planned pairs, about 990 order lines, about 4,000 movements); noise keyed by calendar month so earlier months never change; waste and variance mechanics pinned (kg/l components, the waste order per plant, 77th rule); a setup month so no document predates the masters; PO list paged in scope (lesson of 2026-10-20); timing spike at the end of Phase 2 and a reduced test configuration; the extras listed as Q15 for the owner to strike; wording fixes (R04 citation, race mechanism, exemptions of the callers test, entity comments to update). Not applied: dropping the extras (kept as defaults, Q15).

## Changes

- `.ai/specs/2026-10-21--0718UTC-test-tenant-dataset.md` (new)
- `.ai/runs/2026-10-21--0718UTC-test-tenant-dataset-spec.md` (this log)
- GitHub issue #126 (E12-S02, labels `feature`, `priority-medium`, `risk-high`), linking the spec; the design-only PR is noted in the issue once opened.

## Verification

- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 6 tests passed (after `npm ci` in the worktree, which had no `node_modules`).
- Fresh-context skeptical review of the draft (a subagent given the spec, the rules, the lessons and the posting code): 1 critical, 4 high, 6 medium, 12 low findings, all folded into the spec or recorded as owner decisions (see the log). No code was written, so no lint, typecheck, coverage or build run applies.

## Follow-ups

- The owner confirms Q2, Q4, Q6, Q15 and Q16 on the design PR; the spec is a proposal until it merges (SDLC.md).
- Implementation: `om-auto-implement-spec .ai/specs/2026-10-21--0718UTC-test-tenant-dataset.md` after the design PR merges; existing deployments then adopt the dataset with one Test reset.
