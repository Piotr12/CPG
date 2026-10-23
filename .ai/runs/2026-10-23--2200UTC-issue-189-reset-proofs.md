# Prove the Test reset leaves Prod alone and restarts every sequence (#189)

**Date:** 2026-10-23 22:00 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` via cezar
**Spec:** `.ai/specs/implemented/2026-10-20--1636UTC-atomic-test-reset.md` (implemented; this run adds evidence)
**Status:** in progress

## Goal

Issue #189 (E12-S04), tests only: Prod gets a stock correction, a transfer and a purchase order before the reset and keeps them unchanged (TEN-025); the first ID of every sequenced kind restarts (TEN-029); TEN-026 runs against a real read-only Test; E2E-010, E2E-018 and E2E-020 are chained as written; catalogue rows and the spec's stale note are updated.

## Plan

1. `packages/core/src/services/tenants/test-reset.service.test.ts`
   - `populate()` gives Prod a supplier, a second location, a stock correction, a dispatched transfer and a purchase order. The existing per-table Prod comparison then covers them; assert those Prod tables are non-empty so the comparison can't pass vacuously. After the reset, the next Prod material continues its own sequence.
   - TEN-029: chain realistic → tiny. The old generation has more of every seeded document kind than tiny, plus extra masters and two transfers; after the tiny reset every kind's codes are exactly `00000001…N`, and a new transfer is `00000001`.
   - TEN-026: drive the "write commits first" interleave from the caller's transaction (as the API does) instead of a spy on the reset; add a read-only Test case where a write from an independent connection, made while the reset's transaction holds the writer lock, is refused by the gate and never lands.
2. `tests/integration/test-reset-api.test.ts`
   - Prod gets a stock correction, a dispatched transfer and a PO in `beforeAll`; the Prod comparison includes them (lists, details, the stock ledger).
   - Every sequenced kind's IDs after a reset start at 00000001 and are contiguous.
   - E2E-010: a normal user posts a Prod goods receipt while the admin resets Test.
   - E2E-018: the Polish/dark user revisits the app after the reset and sees Polish and dark.
   - E2E-020: a Test goods issue posted under G1 is retried with its key after the reset; refused, G2 stock and issues unchanged, the token still works, Prod unaffected.
3. Catalogue rows (TEN-025/026/029, E2E-010/018/020) and the spec's implementation note.

## Log

- 2026-10-23 22:00 UTC — triage: real gap (rows still Partially verified / Not executed; no PR or commit references #189). Classified as tests-only (`refactor`), bug route. Claimed #189.

## Changes

## Verification

## Follow-ups
