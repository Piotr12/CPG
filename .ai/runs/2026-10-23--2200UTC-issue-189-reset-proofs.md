# Prove the Test reset leaves Prod alone and restarts every sequence (#189)

**Date:** 2026-10-23 22:00 UTC
**Agent:** Claude Code (Opus 5.5), `om-auto-fix-issue` via cezar
**Spec:** `.ai/specs/implemented/2026-10-20--1636UTC-atomic-test-reset.md` (implemented; this run adds evidence)
**Status:** done

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
- Unit: the first TEN-029 run failed on `purchase_requisition` (5 in realistic and 5 in tiny), so the old generation also gets an extra requisition; the extra BOM takes the next free priority for its output. The "sequenced kinds" list is derived from the metadata (tenant-owned with a `code`) and asserted to be the 14 expected tables, so a new kind fails the test until it is listed.
- TEN-026: the spy on `currentState` became the caller's own transaction, as the API runs a reset, with an attempt counter proving the stale-snapshot retry happened. The read-only case runs the reset inside an open request transaction and makes the write from the second connection through `IdempotencyService.run`, the API's real gate. A write to a *writable* Test during the uncommitted reset isn't tested: in one process, better-sqlite3 would busy-wait on the lock and block the event loop for the busy timeout (spec risk table).
- E2E-020: a goods issue on a shipment created in G1 would get an ID G2 doesn't have (00000082), which a retry can't reach anyway. The test issues on a seeded Open shipment instead, which G2 has under the same ID.
- E2E-010 stays Partially verified: its Given's MRP results don't exist yet.
- Integration: Docker isn't running locally, so the standalone build ran on a fresh `DATA_DIR` (port 3189).

## Changes

- `packages/core/src/services/tenants/test-reset.service.test.ts`: Prod setup in `populate()`, non-empty Prod tables, Prod's sequences carry on, the TEN-029 realistic → tiny chain over every sequenced table, TEN-026 without the spy, plus the read-only case.
- `tests/integration/test-reset-api.test.ts`: Prod stock, transfer and PO in `beforeAll` and `prodState()`, sequence checks after each reset, the E2E-018 browser checks, and new E2E-010 and E2E-020 tests.
- `.ai/specs/research/CPG-acceptance.md`: TEN-025, TEN-026, TEN-029, E2E-018 and E2E-020 are Passed (automated); E2E-010 is Partially verified (MRP gap).
- `.ai/specs/implemented/2026-10-20--1636UTC-atomic-test-reset.md`: the stale "do not yet exist" note is replaced.

## Verification

- `npx vitest run packages/core/src/services/tenants/test-reset.service.test.ts`: 14 passed.
- `npm run lint`: 0. `npm run typecheck`: 0. `npm run build`: 0.
- `npm run test:coverage`: the first run had 1 failure, `auth.service.test.ts` "throttles a client that sprays usernames", which timed out at 5 s under load. It passed alone (26/26), and the full re-run passed: 496 files, 3,546 tests, 100% thresholds met (exit 0).
- Integration against a fresh standalone server: `test-reset-api.test.ts` 5/5 passed; `test-reset-realistic.test.ts` and `test-reset.test.ts`, run after it on the same server, 10/10 passed. The full suite runs in CI.

## Follow-ups

- E2E-010's MRP results await MRP.
- `auth.service.test.ts` "throttles a client that sprays usernames" can exceed Vitest's 5 s default under a loaded full run. Not caused by this change, which touches no auth code; noted in case it recurs.
