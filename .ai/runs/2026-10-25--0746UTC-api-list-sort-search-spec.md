# Spec for optional sort and search on the API list routes (#221)

**Date:** 2026-10-25 07:46 UTC
**Agent:** Claude Code / claude-opus-5-5 (cezar, `om-auto-fix-issue` feature route → `om-auto-write-spec`)
**Spec:** `.ai/specs/2026-10-25--0746UTC-api-list-sort-search.md`
**Status:** done

## Goal

Turn issue #221 (an `enhancement`) into a spec on a design-only PR, then hand it on to `om-auto-implement-spec`.

## Log

- 07:40 Took the feature route: the issue is labelled `enhancement`. FR triage passed: the API list routes parse only `page` (for example `transfers/route.ts`); there is no Definition of Ready in SDLC.md, no claim, no PR referencing #221 and no spec covering it.
- 07:44 Claimed #221 (assignee, `in-progress`, claim comment) and branched `spec/api-list-sort-search` from `origin/main`.
- 07:46 Context: the services already take `{ page, q, sort, dir }` (#217). The seven unpaged routes don't parse their query at all, purchase orders and purchase requisitions strip unknown keys, and transfers, customer orders and production orders refuse them. That is why Q1 keeps each route's unknown-key behaviour.
- 07:50 Wrote the spec with four autonomous defaults (Q1–Q4). None needs human confirmation. Sent a fresh-context reviewer on scope cohesion and code claims.

## Changes

- `.ai/specs/2026-10-25--0746UTC-api-list-sort-search.md` (new).

## Verification

- Docs-only change. `npm test`'s naming check covers the new file names.

## Follow-ups

- Implementation on its own PR via `om-auto-implement-spec`.
