# Execution plan: API writes are safe to retry and stale edits are rejected

**Date:** 2026-10-19 15:56 UTC
**Agent:** Claude Code / claude-opus-5-5. cezar → `om-auto-fix-issue 21` → feature route → `om-auto-write-spec 21` (spec PR #47) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--1548UTC-api-idempotency.md (spec PR #47)
Issue: #21

## Goal

Every state-changing bearer request needs an `Idempotency-Key`. A same-key repeat within 24 h replays the first result and changes nothing, and reusing a key for another request is a 409. User edits carry a `version`, so a stale one is a 409, through the UI and the API. Test-scoped writes carry the current `Dataset-Generation`: 428 without it, 409 when stale. The users and preferences API routes that #17 deferred here ship on top.

## Scope

- `packages/db`: `entities/idempotency/*` (global and tenant-owned key stores), `User.version`, and one migration with its snapshot and index.
- `packages/core`:
  - `services/idempotency/{idempotency.service,fingerprint}.ts`;
  - `http/{idempotency-key,request-transaction,errors,tenant-server-action}.ts`;
  - `domain/tenants/generation.ts`;
  - `services/users/user.service.ts` (versions);
  - `validators/users/*`;
  - container, cradle and index.
- `packages/app`:
  - `auth/api-write.ts`;
  - `app/api/{users,users/[id],users/[id]/password,preferences,tokens/[id]}/route.ts`;
  - the users actions and dialogs;
  - i18n (en/pl) and the `api-tokens` help topic.
- Tests: unit tests next to every file; `tests/api-writes.test.ts`; `tests/tenant-entry-points.test.ts`; `tests/integration/api-idempotency.test.ts`.
- Docs: `BACKWARD_COMPATIBILITY.md` (key enforced, new routes, headers and codes); `.ai/docs/engineering-standards.md` (the write wrapper).

**Non-goals:**
- tenant-scoped write routes and their integration tests (#22);
- the Test reset (slice 2);
- idempotency keys on server actions (spec Q13);
- versions on preferences or tokens (spec Q10).

## Risks

- **The spec isn't on `main` yet.** It sits on spec PR #47 and is read from there; this branch doesn't commit it.
- **MikroORM transaction propagation (spec Q6).** The transaction opens with `em.begin()` on the request `em`. Step 2's timeout tests prove that nested `transactional()` joins it. If they don't, stop and re-plan; never patch around a hang.
- **Tightened contract.** `DELETE /api/tokens/{id}` now requires the key. It was announced in `BACKWARD_COMPATIBILITY.md`.

## Deviations from the spec

- **Lock order (spec Q6).** The spec has the purge run first, to take SQLite's write lock before any read. Doing so deadlocked a two-connection test. better-sqlite3 waits for a lock synchronously, which blocks the event loop, so a second connection in the same process (another Next.js bundle) stalls everything for `busy_timeout`. The design changed in three ways:
  - `run` reads first, and does the key's writes (purge, then insert) last. The write lock is taken only with the handler's first write, after any argon2 await.
  - The lookup filters out expired records itself.
  - A lost race, whether a unique violation or a stale snapshot ("database is locked"), rolls back and tries once more. The second attempt then replays.

  Tested with two ORMs on one file.
- **`tenantServerAction` checks the generation after parsing the input**, not before as the spec's step 5 says. The check still runs before the handler, inside its transaction. `serverAction` drops the field errors of a `ValidationError` thrown inside a handler, so parsing must stay outside, and a malformed form still shows its field errors.
- **Fixed a flaky ApiTokenService audit test on the way** (5b3aab0). Create and revoke in the same millisecond sorted by their random id.
- **`IdempotencyService.run`, not `execute`.** ESLint bans `.execute(` everywhere as the raw-SQL entry point.

## Implementation Plan

Follows the spec's Implementation Plan, Steps 1–10, unchanged.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Idempotency keys for global routes

- [x] 1.1 Entities and migration — b1645b7
- [x] 1.2 Fingerprint, headers, request transaction and IdempotencyService — d9a83cc
- [x] 1.3 apiWrite and the token route — 2fc3e50

### Phase 2: Tenant writes

- [x] 2.1 Generation precondition — d9a83cc, 1d157c6
- [x] 2.2 tenantServerAction with the generation — 4da519d

### Phase 3: Versions

- [x] 3.1 UserService versions — 5b3aab0
- [x] 3.2 Users screen — cfbed9d

### Phase 4: Parity routes

- [ ] 4.1 Routes
- [ ] 4.2 Help
- [ ] 4.3 Integration tests
