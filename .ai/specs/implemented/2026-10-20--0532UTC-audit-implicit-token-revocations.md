# Tokens ended by a password reset or a deactivation are kept in the Global audit

**Status:** implemented
**Created:** 2026-10-20 05:32 UTC
**Issue:** #44 · **Builds on:** `implemented/2026-10-19--1053UTC-api-tokens.md` (#17, #41), `implemented/2026-10-19--1050UTC-audit-log.md` (#20) · **Design authority:** `.ai/specs/product-brief.md` (R06, R08), AUD-014, AUD-028

## 📝 TLDR

Today, when the admin resets a user's password or deactivates them, CPG deletes that user's API tokens without an audit entry. A token can show `created` in the Global audit and never show as revoked. This spec proposes that a reset or deactivation writes one `tokens.api-token.revoked` entry per deleted token, attributed to the admin and committed in the same transaction. The tokens CPG deletes at startup because `CPG_ADMIN_PASSWORD` changed stay unaudited, and the code and the Global audit help now say so.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | Is the startup purge of the admin's tokens recorded under a "system" actor, or documented as unaudited? | **Documented as unaudited.** The doc comment of `revokeAdminTokensIfPasswordChanged` and the Global audit help topic (en, pl) say that these tokens leave no entry, and why. No `system` channel is added. | The issue accepts either outcome. A system actor needs a new `AuditChannel` value. That changes the `channel` check constraint on both append-only audit tables, so SQLite has to rebuild them in a migration. It also needs a label in the audit screen and API, and a decision on what `actorUserId` holds. It would also settle the materials seed (materials spec Q9). That is a separate capability with its own schema change, so it gets its own story (Follow-ups). |
| Q2 | Does the entry say why the token ended (reset vs. deactivation) or whose it was? | No. Same action, subject and snapshot as a revoke by the owner: `tokens.api-token.revoked`, subject `ApiToken` (id, name), before `{ name }`, after `null`. | The issue asks for "only the name". The `users.user.password-reset` or `users.user.deactivated` entry from the same transaction names the user. It carries the same actor, session and channel and has (nearly) the same time, so it gives both the reason and the owner. A new action or snapshot field would be a new audit contract that nobody asked for. |
| Q3 | Split the issue? | No. | Both parts are about one gap: tokens deleted by the system, as a side effect, without an entry. The startup part is now a documentation change only. |

None needs human confirmation before merge. Each answer is reversible, and none weakens security or an audit guarantee. Every token deletion that is audited today stays audited, and one that isn't becomes audited.

## 📝 Problem Statement

AUD-014 requires token creation and revocation in the Global audit. `ApiTokenService.revoke` records it when the owner revokes a token. The two other ways a token ends do not:

- `UserService.changeNormalUser` (`resetPassword`, `setActive(false)`) runs `em.nativeDelete(ApiToken, { user })`. The `users.user.password-reset` / `users.user.deactivated` entry records the account change, but not the tokens.
- `revokeAdminTokensIfPasswordChanged` (`packages/core/src/database.ts`) deletes the admin's tokens at startup when `CPG_ADMIN_PASSWORD` changed. It writes no entry, and nothing says it doesn't.

So someone reading the audit for a token that was used in an incident sees it created and never ended. The issue was found while reviewing the merge of #41 with #20.

## 📝 Proposed Solution

- **Reset and deactivation.** Inside the transaction `changeNormalUser` already runs, when the change ends the user's credentials:
  1. read the user's tokens through the transaction's own `em` (`em.find(ApiToken, { user: user.id })`, never `this.em`), **before** the delete;
  2. delete them with the existing `nativeDelete`;
  3. record one `tokens.api-token.revoked` entry per token with the caller's `actor` (UI session or API token) through `recordGlobalAudit`. The entries are queued on that `em` and inserted by the flush that also writes the user change and its own entry.

  Atomicity comes from the `em.transactional` wrapper, not from the order of the calls. `nativeDelete` runs at once, but inside the transaction, so a throw anywhere in the callback (the version check, the flush's optimistic lock, an insert) rolls back the delete too. The token entries and the user entry commit together or not at all.
- **One definition of the revoked entry.** The entry shape now has two producers, so `tokenEntry` moves out of `api-token.service.ts` into `services/api-tokens/api-token-audit.ts`. That module exports `tokenRevokedEntry(token)` and `tokenCreatedEntry(token)`. `ApiTokenService` and `UserService` both use it, and the snapshot allowlist (`{ name }`) lives in one place (AUD-028).
- **Startup purge.** Stays unaudited (Q1). The function's doc comment says so and gives the reason: it runs without a request, actor or session, and the audit has no system actor. The Global audit help topic gets one sentence: "When the administrator's password is changed in the server's settings, the administrator's API tokens end at the next restart without an entry here."

**Alternatives considered.**
- *`ApiTokenService.revokeAllOf(userId, actor)` called from `UserService`.* It would make `UserService` depend on `ApiTokenService`. The service also runs on its own `em`, not on the fork `changeNormalUser`'s transaction runs on, so it would need an `em` parameter. A pure entry builder is simpler, and the delete stays where the session delete is.
- *A database trigger that writes the entry on `api_token` delete.* A trigger doesn't know the actor, and the audit is written by the service layer by design.

## 📝 Architecture

- `packages/core/src/services/api-tokens/api-token-audit.ts` (new): the entry builders.
- `packages/core/src/services/api-tokens/api-token.service.ts`: uses the builders. No behaviour change.
- `packages/core/src/services/users/user.service.ts`: `changeNormalUser` reads, deletes and audits the tokens. The class doc's R06/R08 paragraph mentions the token entries.
- `packages/core/src/database.ts`: doc comment only.
- `packages/app/src/help/topics.ts`: the Global audit topic, en and pl.

No new binding, route, entity or migration. The audit screen and `GET /api/audit` already render `tokens.api-token.revoked` (i18n key `tokens.api-token.revoked`).

## 📝 Data Model

No change. The new entries use the existing `global_audit_event` columns.

## 📝 API Contracts

No new or changed route. `GET /api/audit` returns the extra entries. Their action and shape already exist, so a consumer that handles a revoke by the owner handles these too.

## 📝 UI/UX

There is no new screen or control. The Global audit lists the new entries like any revoke: **API token revoked**, subject the token name, actor the admin. The only copy change is the help sentence above (en and pl).

## 📝 Edge Cases & Failure Scenarios

| Case | Behaviour |
|---|---|
| The user has no tokens | Only the user entry, as today |
| The user has several tokens | One entry per token, all in the same transaction as the user entry |
| Deactivating a user who is already inactive, or reactivating | Nothing is deleted, so no token entry (idempotent path unchanged) |
| Stale version | `VERSION_CONFLICT` before anything is read or deleted; no entries |
| The flush fails after the delete (e.g. a concurrent version bump trips the optimistic lock) | The transaction rolls back the delete: tokens kept, no entries, `VERSION_CONFLICT` |
| The user creates a token while the admin resets them | `ApiTokenService.create` refuses once the session is gone (existing compare-and-set). A token committed by another connection after the reset's first read makes the reset's first write fail with a stale snapshot (`SQLITE_BUSY_SNAPSHOT`). The whole reset then fails, exactly as the existing session delete does today. So a reset that commits has deleted exactly the tokens it read, and each one has its entry |
| The reset arrives through the API (`/api/users/{id}/password`) | The entries carry the API actor (channel `api`, the admin's token) |
| The admin's own token is used to reset someone else | Only the target user's tokens are deleted and recorded |

## 📝 Risks & Impact Review

- **Audit volume.** One extra entry per token per reset or deactivation. Accounts hold a handful of tokens, so this is negligible.
- **Write-lock time.** Adds one indexed read (`api_token.user_id`) inside the existing short transaction. No async work is added inside the lock.
- **Reversibility.** Code only, no schema change. Entries already written stay (append-only), and that is the point.
- **Known gap kept.** The startup purge stays unaudited by decision (Q1), not by accident. A later system actor can close it together with the materials seed.

## 📋 Implementation Plan

### Phase 1 — audit the tokens a reset or deactivation ends

1. **Extract the entry builders.** Add `services/api-tokens/api-token-audit.ts` with `tokenCreatedEntry` and `tokenRevokedEntry`, and switch `ApiTokenService` to them. Unit test: the two shapes, and the snapshot holds only `name`. The existing `api-token.service.test.ts` stays green.
2. **Record the entries in `changeNormalUser`.** Read the tokens, delete them, and record one revoked entry per token with the caller's actor. Update the class doc. Unit tests in `user.service.test.ts`, against a real SQLite file:
   - a reset of a user with two tokens writes two `tokens.api-token.revoked` entries (subject id and name, before `{ name }`, after `null`, actor/session/channel of the admin) plus the reset entry, and deletes both tokens;
   - a deactivation does the same;
   - a user with no tokens gets no token entry;
   - an idempotent deactivation and a reactivation write none;
   - a stale version writes none and keeps the tokens;
   - a flush that fails after the delete (a concurrent version bump between the read and the flush, as the existing optimistic-lock test does) keeps the tokens and writes no entry;
   - another user's tokens are untouched and unrecorded;
   - an API actor is recorded as channel `api` with its token.
3. **Document the startup purge.** Update the doc comment of `revokeAdminTokensIfPasswordChanged` and the Global audit help topic (en, pl). `packages/app/src/help/topics.test.ts` asserts that both languages carry the sentence.
4. **Integration.** Extend `tests/integration/api-tokens.test.ts` ("ends every token of a user the admin resets or deactivates"): after the reset and the deactivation, `GET /api/audit` as the admin holds a `tokens.api-token.revoked` entry for each of tara's and omar's tokens, attributed to `admin` with channel `ui`.

## Follow-ups

- A `system` audit actor (new `AuditChannel` value plus a table-rebuild migration) to record the startup purge of the admin's tokens and the Test materials seed (materials spec Q9). File it as its own story when someone needs those entries.
