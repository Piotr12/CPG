# Issue #25 — read-only tenants (spec, then implementation)

**Date:** 2026-10-19 20:14 UTC
**Agent:** Claude Code (Opus 5.5) via cezar, `om-auto-fix-issue 25` → `om-auto-write-spec 25` → `om-spec-writing --autonomous`
**Spec:** `.ai/specs/2026-10-19--2018UTC-read-only-tenants.md` (written in this run)
**Status:** done (spec PR #55 ready; implementation on #57, ready)

## Goal

#25 (E02-S04): the admin sets independent read-only flags on Test and Prod; a read-only tenant refuses every business write (UI and API, the admin's included) while reads, audit, preferences, user management and the flag toggle keep working. Feature route: write the spec and open the design-only spec PR, then implement it on its own PR.

## Log

- 20:14 FR triage: `feature` label; no read-only gate in the code (the Test/Prod tenants spec defers it to #25); no PR references #25; no covering spec; `SDLC.md` has no Definition of Ready. Dependencies #21 and #22 are merged. Claimed #25. Branch `spec/read-only-tenants` from `origin/main` in the cezar worktree.
- Context read: the brief (R05, D05), PRD §05 and A-01 (text extracted from the PDFs), TEN-015…028, API-030, AUD-016, the #42 hand-off comment on #25, `tenantServerAction`, `IdempotencyService`, `apiWrite`/`tenantApiWrite`, `TenantService`, the tenant scope, the strip, `/admin`, the materials actions/pages/routes, the repo tests `api-writes` and `tenant-entry-points`, and `BACKWARD_COMPATIBILITY.md`.
- 20:18 Spec drafted. 11 Open Questions resolved by autonomous defaults, none ⚠.
- 20:21 Docker works. Booted `main` via `.ai/scripts/test-env-up.sh` and captured `/admin` and `/admin/prod/materials`. Rendered three static mockups.
- 20:30 The fresh-context review returned "revise". Folded in:
  - `tenant-entry-points` is tightened (every tenant action export goes through `tenantServerAction`); a write-locked db scope is recorded as deferred;
  - Q10 flipped: the seed skips a read-only Test, because it runs at every start whenever Test is empty;
  - the toggle action retries a stale snapshot, and its comparison reads fresh; the edge-case text about the lock wait is corrected;
  - `tenantServerAction` is documented as write-only;
  - the BACKWARD_COMPATIBILITY §4 exception for the metadata route;
  - tenant-neutral error copy;
  - the strip reads through `requestScope().tenantService` and keeps the label inside `#tenant-strip-text`.
- 20:33 Opened spec PR #55, ready (no ⚠), with labels, the evidence comment, the defaults table (also on #25) and the summary. Handed the issue lock to the implementation.

- 20:27–22:55 Implemented on `feat/read-only-tenants` (#57). The plan, its deviations and its verification are in `.ai/pipeline/runs/2026-10-19--2027UTC-read-only-tenants.md`.
  - The first Docker integration run failed: `revalidatePath("/admin", "layout")` made Next.js re-prerender the tenant shells at runtime, and the tenant pages hung. A materials refresh also hid the read-only refusal. Both are fixed, with two lessons added, and the spec on #55 amended.
  - QA screenshots of the production image are on #57.
- 23:05 A fresh-context code review approved #57 with six Low findings, all fixed in 7a9ea73:
  - the API message names Cave control;
  - the audit subject type is `Tenant`;
  - server actions are allowed only in a tenant `actions.ts`;
  - TEN-016 has a Test master-data API case;
  - `checkTenant` is renamed;
  - the spec text matches the code.

  Released the issue lock.

## Changes

- Spec PR #55: `.ai/specs/2026-10-19--2018UTC-read-only-tenants.md`, `.ai/specs/assets/read-only-tenants/` (two current screenshots, three mockups), and this log.
- Implementation PR #57:
  - `Tenant.readOnly` and its migration;
  - `TenantService.setReadOnly`/`currentState`, `assertWritable`, and the gate in `tenantServerAction`, `IdempotencyService` and the demo seed;
  - `PATCH /api/tenants/{tenant}`;
  - the Read-only card on `/admin`, the strip label, and the hidden materials controls;
  - i18n and help;
  - the repo tests `api-writes` and `tenant-entry-points`;
  - `BACKWARD_COMPATIBILITY.md` §4, the acceptance statuses and lessons.

## Verification

- #57, at 7a9ea73:
  - `npm run lint`, `npm run typecheck`: pass;
  - `npm run test:coverage`: 177 files, 1149 tests, 100%;
  - `npm run build`: pass;
  - `npm run test:integration` (Docker, production image): 18 files, 116 tests pass.
- `npm audit` was not re-run: no dependency changed.
- This spec PR is docs only.

## Follow-ups

- The owner reviews and merges #55 (design) and #57 (implementation). #57 needs a human `qa-approved`: it is `risk-high`, so the self-QA path doesn't apply.
- Once both are merged, move the spec to `.ai/specs/implemented/`. The spec isn't on this branch, so #57 can't move it.
- **Slice 3:** MRP runs must call `assertWritable` (TEN-019).
- **Slice 2:** the Test reset must serialize against flag changes and restore the flag (TEN-022…027).
- **Deferred (spec Q2):** a write-locked tenant scope in `@cpg/db`, if a page or `GET` ever writes.
