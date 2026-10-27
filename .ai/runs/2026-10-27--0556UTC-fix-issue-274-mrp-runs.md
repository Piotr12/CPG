# om-auto-fix-issue #274 — MRP runs (E14-S02): spec

**Date:** 2026-10-27 05:56 UTC
**Agent:** Claude Code (cezar, headless) / claude-opus-5-5
**Spec:** `.ai/specs/2026-10-27--0556UTC-mrp-runs.md`
**Status:** done

## Goal

Take #274 end to end with `om-auto-fix-issue`. It is a `feature` issue, so the run takes the feature route. Triage found no Definition of Ready in `SDLC.md`, no implementation in the code and no PR referencing #274. No spec existed, so `om-auto-write-spec 274` writes one, and `om-auto-implement-spec` builds it on its own implementation PR. This log covers the triage and the spec; the implementation's run log is its execution plan under `.ai/pipeline/runs/`.

## Log

- 05:56 Triage. #274 is labelled `feature`, is open and unassigned, and no PR mentions it. Nothing under `services/mrp`, `entities/mrp` or `admin/[tenant]/mrp` exists. Claimed the issue (assignee, `in-progress`, claim comment) and branched `spec/mrp-runs` from `origin/main`.
- 06:00 Read the context: lessons, the engineering standards, the #273 engine spec, and the write-path code (`tenantApiWrite`, `tenantServerAction`, `IdempotencyService`, `holdWriteGate`, `TenantGuard`, `resetTestData`). Also read the PRD §04 "Invocation" and the data model's "MRP run" and "MRP daily result".
- 06:04 Wrote the spec and resolved the eleven open questions with reversible defaults, recorded in the spec. The ones that shape the most code:
  - Q1: keep every run record, but only the latest run's daily rows;
  - Q3: one tenant audit entry per run;
  - Q6: store results by business ID;
  - Q8: declare both run modes now.
- 06:06 Sent the spec to a fresh-context reviewer (scope cohesion, consistency, claims against the code). Docker is unavailable on this machine, so the current-state screenshots come from `next dev`, not the test-env image.
- 06:08 Captured current screens (`/admin/test/reports/stock`, `/admin/test`) from `next dev` on a throwaway `DATA_DIR`. Rendered two static mockups of the MRP page (writable with a run; read-only with none) into `.ai/specs/assets/mrp-runs/`.
- 06:12 Folded in the review:
  - **High:** `formatDecimal` turns −15.5 into `"-15.-500000"`. Balances are stored with `formatSignedQuantity`, and a test covers a fractional negative. #273's spec named the wrong helper too.
  - **Medium:** restated the write gate's window. A transaction already open on another connection can still commit or hold the lock, so the spec now covers the plain-BUSY 500 and adds a two-ORM test.
  - **Medium:** the latest-run `GET` reads inside one read transaction, and `?run=` answers 409 `MRP_RUN_SUPERSEDED`, so pages from two runs never mix.
  - **Medium:** added tests that a run changes nothing else (every tenant table, from metadata), that the stock report API still says 5, and that `/up` answers before the run's `POST`.
  - **Low:** the order-join fallback, RUN-002 through the GET, admin read-only, RUN-001 after real changes, the `MRP_RUN_IDS_EXHAUSTED` UI text, `mode` typed with both values, the yield helper in `core/src/http/`, explicit benchmark counts, and `actorUserId` not null.
- Noticed `.ai/specs/2026-10-27--0525UTC-mrp-engine-projection.md` is still on `main` beside its `implemented/` copy. #295, stacked on the spec PR #294, moved the file, but the squash merge of #294 put it back. The implementation PR removes the stray copy.

- 06:16 Opened the spec PR #298 with its labels, the assumptions, the visual evidence and a run summary, and handed the issue lock to `om-auto-implement-spec`. It runs on #299 (`feat/mrp-runs`, from `main`); its execution plan `.ai/pipeline/runs/2026-10-27--0614UTC-mrp-runs.md` is that run's log.
- 08:15 #299 is ready. Its gate is green (100% coverage). The touched integration files pass on a standalone build. A fresh-context code review's major and minors are fixed, and the UI evidence is posted. The issue lock is released.

## Changes

- `.ai/specs/2026-10-27--0556UTC-mrp-runs.md`, `.ai/specs/assets/mrp-runs/`

## Verification

- Spec review by a fresh-context subagent: one cohesive capability, no split. Its High, three Medium and nine Low findings are folded in (06:12).
- `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts tests/design-tokens.test.ts`: 3 files, 54 tests passed.

## Follow-ups

- Merge #298 before #299. Then merge `main` into #299 and delete the spec's active copy (`tests/ai-filenames.test.ts` enforces it).
- #299 still needs CI's full integration suite and a human QA pass (`needs-qa`).
