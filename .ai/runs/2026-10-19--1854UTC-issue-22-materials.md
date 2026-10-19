# Issue #22 — materials and unit conversions (spec, then implementation)

**Date:** 2026-10-19 18:54 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 22` → `om-auto-write-spec 22` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/2026-10-19--1858UTC-materials.md` (written in this run)
**Status:** done (spec PR #49 draft; implementation on #50)

## Goal

#22 (E03-S01): the admin creates and maintains materials with sequential per-tenant IDs, type, base unit and exact unit conversions; every user can view them. Feature route: write the spec and open the design-only spec PR, then implement it on its own PR.

## Log

- 18:54 FR triage: `feature` label; no materials code exists (only mentions in tenant/audit comments); no PR references #22; no covering spec; `SDLC.md` has no Definition of Ready. Dependencies #19 and #20 are merged. Claimed #22. Branch `spec/materials` from `origin/main` in the cezar worktree.
- Context read: the brief, the PRD/data model/decision register (text extracted from the PDFs), the MAT/TEN/AUD/API/XLS scenarios, sibling issues #23–#27 (material deactivation is in no other story, so Q7 takes it), `UserService`, the tenant scope and guard, `tenantServerAction`, `apiWrite`/`tenantApiWrite`, the audit recorder, `CrudForm`, `DataTable`, the tenant pages, i18n and help.
- 18:58 Spec drafted with 12 Open Questions resolved by autonomous defaults; Q5 (conversion storage shown only once BOM lines exist) carries ⚠.
- 19:02 Docker works for this account today. Built `main`, ran the standalone server on port 3317 with a temp `DATA_DIR`, captured the current Test home, rendered three static mockups.
- 19:10 The fresh-context review returned "revise". Folded in:
  - H1: two creates racing on two connections hit `SQLITE_BUSY_SNAPSHOT`, not the unique index. The API converges through `IdempotencyService`'s retry; `tenantServerAction` gets the same single retry (`isStaleSnapshot` moves to `request-transaction.ts`). The unique index stays a backstop.
  - A field counts as changed only when its normalized value differs, so the Edit form resending the base unit doesn't trip `BASE_UNIT_HAS_CONVERSIONS`.
  - `QUANTITY_OUT_OF_RANGE` for conversions past 12 integer digits.
  - Units keep their case (no `Mg`/`mg` merge) and allow no space or `/` (safe path segments).
  - Q9 (unaudited seed, against AUD-001) and the new Q13 (the `materials` naming fixes API paths; brief Q04 is open) carry ⚠.
  - `native-select` through the shadcn CLI; the seed through `scopeForTenant(createAppContainer(config, orm), "test")`; sequential seed IDs; the audit subject pinned; deactivation as its own audit action; "< 0.000001" for a zero inverse; API integration tests in Phase 2; the new routes go into `BACKWARD_COMPATIBILITY.md`.

- 19:15 Opened the spec PR #49 as a draft (three ⚠ assumptions), with labels, the visual evidence, the defaults table (also posted on #22) and the summary. Handed the issue lock to the implementation.
- 19:09–19:55 Implemented on `feat/materials` (#50); the plan and its deviations are in `.ai/pipeline/runs/2026-10-19--1909UTC-materials.md`. A fresh-context code review approved, and its six Low findings were fixed. Released the issue lock.

## Changes
- `.ai/specs/2026-10-19--1858UTC-materials.md` (the spec) and `.ai/specs/assets/materials/` (one current screenshot, three mockups with their HTML).

## Verification
- `npx vitest run tests/ai-filenames.test.ts` passes. This PR is docs only; the implementation PR #50 ran the full gate.

## Follow-ups
- The owner confirms Q5, Q9 and Q13 on #49, then merges it. #50 then moves the spec to `implemented/`.
- #26's spec must store the `toBaseQuantity` record (spec Q5), and #44 decides whether the demo seed gets a system actor (spec Q9).
