# Issue #202: patch the shadcn transitive advisories and refresh the audit baseline

**Date:** 2026-10-24 17:02 UTC
**Agent:** Claude Code (Fable 5.1) via cezar, `om-auto-fix-issue 202`
**Spec:** none
**Status:** in progress

## Goal

Move the lockfile's `body-parser` (2.3.0, GHSA-27r3-jxmh-p828) and `fast-uri` (3.1.8, GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr and two low ones) to their patched releases without unrelated upgrades, account for every remaining `npm audit` advisory, refresh the stale "Known `npm audit` state" baseline in `.ai/docs/engineering-standards.md`, and confirm the tooling packages stay outside the traced standalone runtime.

## Plan

1. Triage (`om-verify-in-repo`): `npm audit` on `origin/main`'s lockfile, PR and commit search for #202.
2. Root cause (`om-root-cause`): trace the two advisories to their dependency paths and the semver ranges that admit the patched releases.
3. Fix (`om-fix`): claim the issue, update only the two packages in `package-lock.json`, add a repo-wide test pinning the patched floors, refresh the baseline paragraph and the deviations row in the standards doc.
4. Gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npm audit`; list the traced standalone `node_modules` for the tooling packages.
5. Ship (`om-open-pr --handoff om-auto-review-pr`), review (`om-auto-review-pr --autofix`), release the lock, report.

## Log

- 17:02 UTC: Concurrency check: assignee Piotr12 is the automation user, no `in-progress` label, no claim comment, no open PR references #202. Classified as the bug route (a present, verifiable defect in the lockfile; labels `security`, `dependencies`).
- 17:02 UTC: Worktree: already inside the cezar linked worktree on `cez/ed494b55`, so it is reused and the branch is kept (cezar tracks it; precedent #196 shipped from `cez/6ba83fce`). `npm ci` installed 913 packages.
- 17:02 UTC: Triage evidence: `npm audit --json` on the current lockfile (identical to `origin/main`) reports 2 advisories, body-parser high and fast-uri moderate, both `fixAvailable: true`; `git log origin/main --grep="#202"` is empty; no open or merged PR references the issue. Proceed.
- 17:05 UTC: Paths (`npm ls body-parser fast-uri`): `@cpg/ui` → `shadcn@4.22.0` → `@modelcontextprotocol/sdk@1.32.1` → `express@5.3.0` → `body-parser@2.3.0` (range `^2.3.0`); and `shadcn` → (`@dotenvx/dotenvx` → `conf`, `@modelcontextprotocol/sdk`, `ajv-formats`) → `ajv@8.20.0` → `fast-uri@3.1.8` (range `^3.0.1`). Both patched releases fit the declared ranges. `npm audit fix --dry-run` would change exactly those two but also remove four hoisted wasm helper entries; checking whether that is pre-existing lockfile drift before choosing the command.

- 17:10 UTC: Advisory records (`gh api /advisories/<id>`): GHSA-vfj7-8cjw-p6xm (braces) was **withdrawn** on 2026-10-23, which is why the old baseline's 10 findings vanished; the body-parser and fast-uri advisories were published 2026-10-23 with patched releases 2.4.0 and 3.1.9. A plain `npm install --dry-run` on the untouched lockfile also removes the four wasm entries (`@emnapi/core`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`, optional deps of the never-installed `*-wasm32-wasi` bindings), so that pruning is pre-existing drift under npm 11.12.1, not part of this fix.
- 17:12 UTC: Claimed #202 (`in-progress`, claim comment). `npm update body-parser fast-uri` changed exactly those two lockfile entries (2.3.0 → 2.4.0, 3.1.8 → 3.1.9) and nothing else; body-parser 2.4.0's tightened sub-ranges (`content-type ^2.1.0`, `iconv-lite ^0.7.3`, `qs ^6.16.1`) were already satisfied by existing entries. `npm audit`: found 0 vulnerabilities.
- 17:15 UTC: Added `tests/lockfile-advisories.test.ts` (fails on the old lockfile: body-parser 2.3.0 < 2.4.0), rewrote the "Known `npm audit` state" paragraph and the `npm audit` deviations row in `.ai/docs/engineering-standards.md`, added a lesson under "Tooling, shell and CI". Running the gate.

## Changes

- `package-lock.json`: `body-parser` 2.3.0 → 2.4.0, `fast-uri` 3.1.8 → 3.1.9 (the only entries touched).
- `tests/lockfile-advisories.test.ts` (new): every lockfile copy of `body-parser` ≥ 2.4.0 and of `fast-uri` ≥ 3.1.9.
- `.ai/docs/engineering-standards.md`: refreshed "Known `npm audit` state" (dated, cites the withdrawn braces advisory, the two fixed ones, the runtime-trace check and the `npm update` rule) and the `npm audit` triage row.
- `.ai/lessons.md`: one lesson (Tooling, shell and CI).
- `.ai/runs/2026-10-24--1702UTC-issue-202-shadcn-transitive-advisories.md`: this log.

## Verification

## Follow-ups
