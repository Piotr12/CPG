# Issue #211 — the "stale" optional wasm lockfile entries

**Date:** 2026-10-25 12:04 UTC
**Agent:** Claude Code / claude-opus-5-5 (`om-auto-fix-issue`, dispatched by cezar)
**Spec:** none
**Status:** done

## Goal

#211 asked to prune `@emnapi/core` 1.10.0, `@emnapi/wasi-threads` 1.2.1, `@napi-rs/wasm-runtime` 1.2.5 and `@tybys/wasm-util` 0.10.4 from `package-lock.json`, on the premise (from the #202 run) that npm 11.12.1 drops them on any `npm install`.

## Log

- 12:00 UTC: Concurrency check: #211 assigned to `Piotr12` (the automation identity), no `in-progress` label, no claim comment, no open PR. Classified as a maintenance defect (bug route). Toolchain: npm 11.12.1, node 24.15.0, worktree on `origin/main` acf55945.
- 12:03 UTC: Triage: after `npm ci`, `npm install --dry-run` reports `remove` for the four packages, as the issue says. Claimed the issue.
- 12:05 UTC: The fix the issue prescribes does not exist. Each command below left `package-lock.json` byte-identical: `npm install` over the `npm ci` tree ("up to date"), `npm prune` and `npm audit fix`. A fresh `npm install` with no `node_modules` kept the four entries too; it only added `"hasInstallScript": true` to `better-sqlite3`, an unrelated change, reverted. `npm install --package-lock-only` *added* the bundled deps of `@tailwindcss/oxide-wasm32-wasi` (66 lines), also reverted.
- 12:08 UTC: Root cause of the misreading. The entries are dependencies of `@unrs/resolver-binding-wasm32-wasi` (`"@emnapi/core": "1.10.0"`, `"@napi-rs/wasm-runtime": "^1.1.4"`, plus their own deps), so the lockfile needs them for a wasm32 install. The four have no `cpu` field, so `npm ci` installs them; their only dependent has `cpu: wasm32` and is skipped. `npm ls` therefore marks them `extraneous`, and a `--dry-run` (`npm install` or `npm audit fix`) lists them as `remove` from `node_modules`. From an empty `node_modules` the same dry-run lists no removal. The #202 run (`.ai/runs/2026-10-24--1702UTC-issue-202-shadcn-transitive-advisories.md`, 17:05 and 17:10) only ever saw dry-runs.
- 12:10 UTC: Decision: no lockfile change. Corrected the two documents that carry the wrong premise and would mislead the next reviewer: the "Known `npm audit` state" paragraph in `.ai/docs/engineering-standards.md` and the 2026-10-24 lesson in `.ai/lessons.md` (rewritten, plus a new lesson about `--dry-run` output). The `npm update <package>` advice stays, since it is still the narrowest fix for an advisory.

## Changes

- `.ai/docs/engineering-standards.md`: the "Known `npm audit` state" paragraph no longer says `npm audit fix` prunes unrelated entries; it explains the dry-run `remove` lines.
- `.ai/lessons.md`: corrected the `npm update` lesson; added the `--dry-run` lesson.
- `package-lock.json`: unchanged.

## Verification

- `npm ci`: exit 0, "found 0 vulnerabilities"; `npm audit`: 0 vulnerabilities before and after (unchanged, so the audit baseline's date and list stay).
- `git diff package-lock.json` empty after `npm install`, `npm prune` and `npm audit fix` on the `npm ci` tree.
- Gate: see the PR's validation section.

## Follow-ups

- A fresh `npm install` (no `node_modules`) adds `"hasInstallScript": true` to `better-sqlite3` in the lockfile. That line is accurate, the install was a one-off and was reverted; it will appear in the next fresh-install lockfile diff, so mention it if it does.
