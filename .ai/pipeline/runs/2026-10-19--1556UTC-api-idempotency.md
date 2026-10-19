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

## Implementation Plan

Follows the spec's Implementation Plan, Steps 1–10, unchanged.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Idempotency keys for global routes

- [ ] 1.1 Entities and migration
- [ ] 1.2 Fingerprint, headers, request transaction and IdempotencyService
- [ ] 1.3 apiWrite and the token route

### Phase 2: Tenant writes

- [ ] 2.1 Generation precondition
- [ ] 2.2 tenantServerAction with the generation

### Phase 3: Versions

- [ ] 3.1 UserService versions
- [ ] 3.2 Users screen

### Phase 4: Parity routes

- [ ] 4.1 Routes
- [ ] 4.2 Help
- [ ] 4.3 Integration tests
