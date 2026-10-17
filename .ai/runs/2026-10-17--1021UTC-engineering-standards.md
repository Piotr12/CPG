# Adopt engineering standards (from DevMentor)

**Date:** 2026-10-17 10:21 UTC
**Agent:** Claude Code (claude-opus-5-5) via cezar
**Spec:** none (standards pasted by the human, from the DevMentor project)
**Status:** done

## Goal

Apply the DevMentor engineering standards to CPG, flag what doesn't fit, save the final (CPG-adapted) standards to `.ai/docs/engineering-standards.md`, make sure the repo follows them, push to `main`.

## Plan

1. Adapt the standards to CPG (an MRP II app, not a booking marketplace) and to its real architecture, and write `.ai/docs/engineering-standards.md` with a section listing every deviation from the original and why.
2. `AGENTS.md` + `.ai/README.md`: register `.ai/docs/`, add the domain-concept convention and the reusable-layer rules, point to the standards doc, and add `npm audit` triage to the verification step.
3. Enforce package boundaries in `eslint.config.mjs` (`no-restricted-imports` per package) and `no-console` (only `info`/`warn`/`error`).
4. Bring the existing code in line: `entities/Setting.ts` → `entities/settings/setting.entity.ts`; the admin page and `/up` stop querying the ORM directly and go through a `SystemStatusService` registered in `registerDb`; `Home` → `HomePage`.
5. Verify: lint, typecheck, test, build, dev server (`/`, `/admin`, `/up`), npm audit.

## Log

- 10:21 Read the repo. Things in the original that don't fit CPG are listed under "Deviations" in the standards doc; the most important ones are reported to the human.
- 10:30 Decided to keep CPG's layering (`db → core`) rather than DevMentor's `app → core → db`: DB-backed services go in `db/src/services/<concept>/`, pure MRP logic in `core/src/domain/<concept>/`. No new package. Flagged to the human as the main deviation.
- 10:35 Replaced DevMentor's "every page fetches via apiCall → /api" with services in server components + server actions for mutations (Next.js docs advise against server components calling their own route handlers). `force-dynamic` replaced by `connection()` + Suspense.
- 10:35 Kept MikroORM's default singular table names (no rename migration) and kebab-case for all files (the original mixed casings).
- 10:40 Did not build `core/src/http`, `ui/src/backend`, events, validators/zod, logger or auth: there is no consumer yet. The standards say each arrives with the first concept that needs it.
- 10:45 `npm audit`: 10 high, all `braces` (no fix) via fast-glob → awilix (unused `loadModules`) and dev tooling. `audit fix --force` would downgrade awilix to 6 — recorded as a known state rather than made a hard gate.
- 10:50 ESLint gotcha: a later config block that sets `no-restricted-imports` replaces the earlier one for matching files, so each package block repeats the shared cross-package pattern (helper in `eslint.config.mjs`).

## Changes

- New: `.ai/docs/engineering-standards.md` (CPG-adapted standards + deviations table), `packages/db/src/services/system/system-status.service.ts`.
- `AGENTS.md`: engineering-standards section, updated package table, concept-folder + reusable-layer + explicit-registration rules, `.ai/docs/` in the tree and naming exceptions, `npm audit` triage and checklist review in "Before finishing". `.ai/README.md`: `docs/` row.
- `eslint.config.mjs`: per-package `no-restricted-imports` (layering, `@mikro-orm/*` only in db, no relative cross-package imports), `no-console` except info/warn/error (off for scripts/tests).
- `packages/db`: `entities/Setting.ts` → `entities/settings/setting.entity.ts`; `SystemStatusService` registered in `registerDb` + `Cradle`; exported.
- `packages/app`: `/admin` and `/up` go through `systemStatusService`; `Home` → `HomePage`; instrumentation logs with `console.info`.
- `.ai/lessons.md`: lesson on pre-Cache-Components patterns.

## Verification

- `npm run lint` — clean. Probe files with forbidden imports in each package (next/react in core/db, @cpg/db in core, @mikro-orm in app/core, @cpg/core in ui, @cpg/ui in db, relative `../../db/src/orm`, `console.log`) produced exactly the 9 expected errors; allowed imports (`@cpg/db` in app, `@cpg/ui/lib/utils` in ui, `../scripts/…` inside db) passed. Probes deleted.
- `npm run typecheck` — all 4 packages clean.
- `npm test` — 2/2 pass.
- `npm run db:migration:create -- probe` — "No schema changes, no migration created" (entity move didn't touch the schema).
- `npm run build` — success; `/admin` partial prerender, `/up` dynamic.
- Standalone server (`node packages/app/.next/standalone/packages/app/server.js`): `/` 200, `/up` 200 "OK", `/admin` renders "1 migrations applied / 0 pending / 0 settings" via the service.
- `npm audit` — 10 high (known `braces` chain, documented in the standards doc).

## Follow-ups

- Human to confirm the layering deviation (services in `db`, not `core`).
- `/admin` is public: an authentication spec is needed before anything sensitive lands there.
- Build `core/src/http` + `ui/src/backend` with the first real concept, as its reference implementation.
