# Execution plan — CPG design system v1 (one pull request, decision D8)

**Date:** 2026-10-24 09:25 UTC
**Agent:** lead: Claude Code (claude-fable-5-1) in cezar; workers: cezar child tasks on Claude Code (claude-opus-5-5), one git worktree and branch each
**Issue:** #203 (closes); design PR #204 (refs)
**Source spec:** `.ai/specs/2026-10-24--0842UTC-design-system-v1.md` (Status ready; moved to `implemented/` by the Close unit)
**Branch:** `cez/eb7fb400` (the lead's integration branch; the PR branch)
**Engine:** lead-and-workers per the spec's Phasing table; this folder is the run log (AGENTS.md "Before starting any task", `.ai/skills/om-auto-create-pr-loop/SKILL.md` "Run log")

## Tasks

> Authoritative status table. `Status` is `todo`, `dispatched`, `partial` (re-dispatched) or `done`. A unit is `done` once its branch is merged into `cez/eb7fb400` with `git merge --no-ff` and the gate is green on the merged tree. `Branch` and `Merge` are filled when known.

| Unit | Order | Owns (summary; the spec's Phasing row is binding) | Status | Branch | Merge |
|------|-------|----------------------------------------------------|--------|--------|-------|
| W1 Tokens and focus | sequential 1 | `packages/ui/src/styles/**`, `packages/ui/src/components/**`, `tests/design-tokens.test.ts` (new) | done | cez/a6a67846 | 5bea1416 |
| W2 Shared components | sequential 2 | `packages/ui/src/backend/**`, `badge.tsx`, `button.tsx`, `mammoth-mark.tsx` (new), `status-tone.ts` (new) | done | cez/3e2f33ce | d0da985d |
| W3 Copy and public pages | sequential 3 | i18n, help, `read-only.ts`, home, Help, login, layout metadata, the "Cave control" assertions, 7 integration files | done | cez/ae8611fb | 8c1f12ee |
| P1 Admin page frame and states | parallel | `app/src/app/admin/**` (except `(global)/page.tsx`), `layout.tsx` notice + fallback, not-found and error pages, `tests/integration/not-found.test.ts` | todo | | |
| P2 Document screens | parallel | `components/{customer-orders,shipments,goods-issues,forecasts,production-orders,purchase-orders,purchase-requisitions,purchasing,goods-receipts,transfers,document-lifecycle}/**` (except `status-tone.ts`), 10 integration files | todo | | |
| P3 Master data, stock, reports, admin tools | parallel | `components/{materials,named-records,master-data,boms,planning-parameters,safety-stock,stock,reports,imports,api-tokens,audit,users,preferences,forms}/**`, 14 integration files | todo | | |
| P4 Tenants and navigation shell | parallel | `components/tenants/**`, `components/layout/**`, `admin/(global)/page.tsx` + test, `tenants` and `navigation` integration | todo | | |
| Close (the lead) | last | the scan flip, `.ai/docs/engineering-standards.md`, the spec move, this folder, the PR | todo | | |

## Goal

Implement the whole of `.ai/specs/2026-10-24--0842UTC-design-system-v1.md`: Appendix A as the token file, the focus and overlay changes in every primitive, `StatusBadge`, `Callout`, `PageHeader`, the `Badge`/`Button`/`DataTable` contracts, `MammothMark`, the status tone map, the tenant wrappers, the Voice table in both languages, the public pages, `PageHeader` and `LoadingMessage` on every admin page, the not-found, error and `<noscript>` states, the sidebar defaults, and the two enforcement tests, as one PR against `main` titled `feat(design-system): …`. No product behaviour, business rule, route or permission changes.

## Order and gating

1. W1 → W2 → W3, one at a time. Each is dispatched as a cezar child task forked from this branch's committed tip, validated (diff read against the spec; the four gate commands re-run by the lead on the merged tree, judged by exit codes), merged with `git merge --no-ff`, and only then is the next dispatched.
2. P1, P2, P3, P4 at once, forked from the tip after W3. Merged one at a time as they settle, the gate re-run after each merge, the report-only scan (`tests/design-tokens.test.ts`) read after each merge. A unit that settles `partial` is re-dispatched with what is left. Changes a worker reports as outside its scope are made or assigned by the lead after the merge.
3. Close by the lead per the spec's "Close — the lead".

## Worker contract (every brief carries it)

- The unit's Phasing row (Owns, Delivers) verbatim; the spec sections it implements by heading; its Implementation Plan steps.
- Read `.ai/lessons.md`, `.ai/docs/engineering-standards.md` and the spec first; `npm ci` in its own worktree; tests next to the code at 100 % coverage of its own changes; the gate (`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`) judged by exit codes, never by a piped tail; `npm run test:integration -- tests/integration/<file>.test.ts` for the files in its scope only, against a standalone server when Docker is unavailable (lesson 2026-10-23).
- Prohibitions: nothing outside Owns; no edits to the spec or to `tests/design-tokens.test.ts` (W1 creates it; nobody else touches it); no PR; no push to `main`; report rather than work around.
- Report: files changed, tests added, commands run with exit codes, anything it could not do, anything it needs outside its scope.

## Non-goals

- Any change to routes, API paths, envelopes, error codes, permissions, business rules or number formats (`BACKWARD_COMPATIBILITY.md`).
- A chart, an `info` tone, a brand colour token, a 36 px default control, a home-page screenshot (decisions D3, D4 and the delegated decisions).
- Running the full integration suite more than once locally (CI runs it on the PR).

## Risks (from the spec's Risks & Impact Review)

- Cross-cutting: every screen, the primitives, the token file. Mitigated by sequential foundations, disjoint parallel scopes, one merge at a time with the gate re-run, the browser QA before the PR.
- Density and Polish labels: checked in the browser on the realistic dataset at 320, 768 and 1440 px; a wrong spec value is fixed once in the spec and the code, never per screen.
- Radius aliases hide unmigrated call sites: the report-only scan is read after every merge; the Close flips it.
- Docker is unavailable on this machine: integration files run against a local standalone server (lesson 2026-10-23).
