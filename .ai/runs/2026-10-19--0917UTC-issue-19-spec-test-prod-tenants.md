# Spec for #19 — Test and Prod tenants: selection, indicator and strict isolation

**Date:** 2026-10-19 09:17 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar, `om-auto-fix-issue 19` → feature route → `om-auto-write-spec 19`
**Spec:** .ai/specs/2026-10-19--0913UTC-test-prod-tenants.md
**Status:** done

## Goal

Write the spec for issue #19 (E02-S01) and open a design-only spec PR. The implementation follows on its own PR via `om-auto-implement-spec`.

## Log

- 09:05 — FR triage passed: #19 is a feature with no lock and no PR. #15 merged in #29. `SDLC.md` has no Definition of Ready. No tenant code or spec exists on `origin/main`. Claimed #19.
- 09:13 — Drafted the spec under `om-spec-writing --autonomous` with 10 resolved assumptions, none needing human confirmation. Sources: PRD §05–§06, the data-model PDF, TEN-001…TEN-030 and API-013/API-034, the sibling stories (#16, #17, #20–#22, #25), and the open #18 spec (PR #31). Checked in `@mikro-orm/core` 7.2.5 that a filter whose `cond` takes arguments throws "No arguments provided" when none are set, and that `nativeUpdate`/`nativeDelete` apply filters (`processWhere`). Checked in the Next.js 16 docs that `dynamicParams` is unavailable under Cache Components and `generateStaticParams` must return at least one param.
- 09:17 — Booted the test env, captured `/admin` today, and rendered 3 static mockups with agent-browser.
- 09:25 — A fresh-context architectural review returned "revise": 3 High, 4 Medium, 4 Low, no Critical. All were applied:
  - `TenantEntityManager` refuses `insert`, `upsert`, `clone`, the QueryBuilder and a `nativeUpdate` that sets `tenant` on tenant-owned entities;
  - the guard covers collections, uninitialized references and unloaded `tenant`, and skips global-only flushes;
  - the filter condition reads the tenant from the `em`, not per-call arguments, and ESLint bans `filters` options, stray `setFilterParams` and raw `execute`;
  - the `tenantServerAction` contract, with the tenant bound at render;
  - `onCreate` fills `tenant`;
  - an HTTP `status` on `AppError`;
  - the switcher sits in `<Suspense>`, and without JavaScript it lands on the tenant home;
  - the demo seeder contract (code-level, in a Test scope, built by #22);
  - `TENANT_CODES` re-declared in `core` with an equality test;
  - a `(global)` route group and a title template;
  - no reset exception to the bypass ban;
  - the missing-row edge case reworded.
  The reviewer suggested a per-table immutability trigger, which was declined and recorded under the alternatives: the ORM paths are covered and it would burden every migration.

## Changes

- The spec, its assets (`.ai/specs/assets/test-prod-tenants/`) and this log.

## Verification

- `vitest run tests/ai-filenames.test.ts`: 4 passed. Docs-only change; no code touched.

## Follow-ups

- Implementation: `om-auto-implement-spec` on the spec, with `Closes #19` on the implementation PR.
- #22 must build the demo seeder (Q4) and run the first end-to-end AC4 check (TEN-012, Q6).
- #16 relaxes tenant pages from `requireAdmin` to any active account (Q9); #17 adds bearer auth in `requireApiUser` (Q5).
