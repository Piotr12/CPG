# Add UTC time to `.ai/` file names

**Date:** 2026-10-17 09:49 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none
**Status:** done

## Goal

Replace the `YYYY-MM-DD-slug.md` naming standard for `specs/`, `runs/` and `lessons/` with `YYYY-MM-DD--HHMMUTC-slug.md` (24h UTC time of creation), so files created on a busy day stay ordered. Update every MD file that defines the standard, rename existing files, add a check that runs in CI and fails on the old format, push to `main`.

## Log

- Old files' creation times taken from the cezar session logs (timestamp of the first `Write` of each file), not from commit times, since run logs are created at the start of a run: `ai-metadata-structure` 08:46, `boris-tips-agents-md` 08:51, `monorepo-architecture` 09:07, lesson `mikroorm-entity-identity-next-bundles` 09:20 (all UTC).
- Renamed with `git mv`; links to the renamed files in `lessons.md` and run logs updated. Historical run-log prose describing the old convention is left as written.
- The check is a positive one: every file in those folders except `README.md` must match the new pattern with a valid date and time, which rejects the old format and any other drift. Written with `node:test` (no new dependency) as `npm test`.
- CI: `deploy.yml` gets a `test` job and `deploy` `needs` it, so a bad name blocks the deploy.
- Test file is `.mts`: as `.ts` Node warned `MODULE_TYPELESS_PACKAGE_JSON` because the root `package.json` has no `"type"`. Node 24 strips the types natively, so no runner dependency.
- Template headers now carry the time too (`**Date:** / **Created:** YYYY-MM-DD HH:MM UTC`). Lesson bullets in `lessons.md` keep a plain date — only file names changed.

## Changes

- Naming standard: `AGENTS.md`, `.ai/README.md`, `.ai/{specs,runs,lessons}/README.md`, `.ai/specs/{implemented,archive}/README.md`, `.ai/lessons.md`; `README.md` mentions `npm test`.
- Renamed: 3 run logs and 1 lesson (links updated).
- New: `tests/ai-filenames.test.mts`, `npm test` script, `test` job in `.github/workflows/deploy.yml`.

## Verification

- `npm test` — 2/2 pass. With a temporary `.ai/specs/2026-10-17-old-style.md` it failed (exit 1) naming that file; removed.
- `npx eslint` and `tsc --strict --module nodenext` on the test file — clean.
- `npm run lint`, `npm run typecheck`, `npm run build` — all exit 0.
- Workflow YAML parses; jobs `test`, `deploy` with `deploy.needs = test`. First real CI run happens on this push.

## Follow-ups

- When a test needs dependencies, add `npm ci --ignore-scripts` to the `test` job.
- Consider also running lint/typecheck in the `test` job (not requested here).
