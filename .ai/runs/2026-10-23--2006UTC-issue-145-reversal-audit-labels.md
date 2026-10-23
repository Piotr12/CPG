# Reversal audit fields read in both languages; the variance report proven against a real reversal (#145)

**Date:** 2026-10-23 20:06 UTC
**Agent:** Claude Code (cezar, `om-auto-fix-issue`) / claude-opus-5-5
**Spec:** none (issue #145, E13-S04; specs of #92, #95, #96 already implemented)
**Status:** in progress

## Goal

Issue #145: completion and transfer reversal entries record audit fields without EN/PL labels, a write-off's entry lacks its posting ID, and the variance report was never checked against a real completion reversal.

## Log

- 20:06 — Triage (`om-verify-in-repo`): open, unassigned, no PR or commit references #145; #177 left the field labels out of scope. Confirmed on `main` 8195a0b: `en.audit.fields` has no `movementNOriginal`/`movementNInverse`, `movements`, `posting`, `kind`, `completion`.
- 20:06 — Recorded every field the core suite audits (temporary instrumentation of `toEvent`, reverted): exactly those five are unlabelled.
- Plan (root cause): `fieldLabel` (`app/src/components/audit/audit-table.tsx`) only expands `lineN…`; nothing ties the fields services record to the labels. `tests/audit-labels.test.ts` scans action IDs and record types only.
  1. `core/src/services/audit/audit-fields.ts`: the registry of every field a snapshot may carry (plain names, per-line names for `line{n}{Field}`, and `movement{n}Original|Inverse`). `recordGlobalAudit`/`recordTenantAudit` refuse an unregistered field, the same backstop as the secret check: every audited path has a service test, so a new field fails there until registered, and the label test then fails until it is named in EN and PL. A static scan of snapshot keys was rejected: snapshots are built by helpers, `pick`, spreads and computed keys, so a scan would miss fields silently.
  2. `tests/audit-labels.test.ts`: every registered field has an EN and PL label, and no label names a field nothing records.
  3. EN/PL labels for `movements`, `posting`, `kind` (and its values), `completion`; a `movementField` template for the numbered pairs; `reversal` relabelled "reversal" (it holds a movement, a posting group or a transfer reversal).
  4. `transfer.service.ts`: every posting's entry records `posting` (its ID), so a reversal's `posting` matches the entry it reverses. Applied to dispatch and receipt as well as write-off, so the field means one thing on every transfer entry.
  5. `variance-report.service.test.ts`: reverse through `ProductionCompletionService.reverse`; drop the "#92 isn't built yet" comments (also in `variance-report.service.ts`).
  6. Integration: the REV-014 scenario in `production-transfer-reversals.test.ts` reads the variance report after reversing the 25; `audit-history.test.ts` checks the reversal entries' labels in English and Polish.
  7. `CPG-acceptance.md` (UX-022, REV-011, REV-014), `BACKWARD_COMPATIBILITY.md` (the new `posting` field), lessons.

- 20:10 — Implemented steps 1–7 as planned. Labels: EN "original movement {n}" / "reversing movement {n}", "movement count", "posting", "posting kind" (values dispatch/receipt/write-off), "completion"; `reversal` now reads "reversal". PL: "ruch pierwotny {n}" / "ruch odwracający {n}", "liczba ruchów", "księgowanie", "rodzaj księgowania" (wydanie/przyjęcie/odpis), "wykonanie", "odwrócenie".
- 20:14 — Docker isn't reachable from this account (lesson 2026-10-19), so I ran the touched integration files against the standalone build on a fresh `DATA_DIR`.

## Changes

- `packages/core/src/domain/audit/audit-fields.ts` (+ test): `AUDIT_FIELDS`, `AUDIT_LINE_FIELDS`, `AUDIT_MOVEMENT_ROLES`, `isAuditField`.
- `packages/core/src/services/audit/audit-recorder.ts` (+ test): refuses an unlisted field.
- `packages/core/src/services/transfers/transfer.service.ts` (+ test): posting entries record `posting`.
- `packages/core/src/services/reports/variance-report.service{,.test}.ts`: real reversals, stale #92 comments gone.
- `packages/app/src/components/audit/audit-table{,.test}.tsx`, `packages/app/src/i18n/messages/{en,pl}.ts`: labels and the movement pattern.
- `tests/audit-labels.test.ts`, `tests/integration/audit-history.test.ts`, `tests/integration/production-transfer-reversals.test.ts`.
- `.ai/specs/research/CPG-acceptance.md` (UX-022 Passed (automated); REV-011/014 cite the variance report), `BACKWARD_COMPATIBILITY.md`, `.ai/docs/engineering-standards.md`, `.ai/lessons.md`.

## Verification

- `npm run lint`: 0 errors (1 warning in `bom.service.ts`, already on `main`).
- `npm run typecheck`: exit 0.
- `npm run test:coverage`: 489 files, 3,498 tests passed; lines/statements/functions/branches 100%.
- `npm run build`: succeeded.
- Removing the EN `posting` label makes `tests/audit-labels.test.ts` fail (`expected [ 'posting' ] to deeply equal []`); restored.
- `CPG_BASE_URL=http://127.0.0.1:3145 npm run test:integration -- tests/integration/audit-history.test.ts tests/integration/production-transfer-reversals.test.ts tests/integration/variance-report-api.test.ts`: 3 files, 20 tests passed (standalone build, fresh `DATA_DIR`). The full suite runs in the PR's CI.

## Follow-ups
