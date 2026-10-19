# Code review

How PRs in this repository are reviewed, by humans and by `om-code-review` / `om-auto-review-pr`, which apply this file automatically.

**The primary checklist is Section 1 → "Code review checklist" in [`.ai/docs/engineering-standards.md`](.ai/docs/engineering-standards.md)** (also wired in as `reviewChecklist` in `.ai/agentic.config.json`). This file does not repeat it. It adds the review priorities, the checks that come from this repo's stack and recorded pitfalls, and how to grade findings.

## Priorities, in order

1. **Correctness.** Does the change do what its issue or spec says? A spec in `.ai/specs/` is the source of truth. A PR that drifts from it is a finding, even when the code is good.
2. **Security.** The engineering-standards security items are blockers. `/admin` requires an admin session: a new admin page that doesn't call `requireAdmin()` inside its data boundary is a blocker (`tests/admin-pages-require-admin.test.ts` catches the missing call, not a misplaced one).
3. **Contracts.** Every surface in [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md). A merge to `main` is a production deploy.
4. **Tests.** 100% coverage of what the PR adds or changes, tests that assert behaviour, and an integration test for each new page or flow.
5. **Structure and quality.** Layering, the reuse-once rule, naming, the code-quality rules.

## Repo-specific checks

**Next.js 16 / Cache Components**
- A server component that reads the database calls `await connection()` and sits inside `<Suspense>` with a `feedback/` fallback. `export const dynamic`, or any other route-segment config, is a blocker: it no longer exists.
- Server components never fetch the app's own `/api` routes. They read through services and mutate through server actions.
- `fs` paths built from env or `process.cwd()` carry `/* turbopackIgnore: true */`. Without it, Turbopack traces the whole repo into the standalone output.
- New Next.js APIs match `node_modules/next/dist/docs/`, not pre-16 habits.

**Data and DI**
- `app` code reads and writes only through `(await requestScope()).cradle.<name>Service`. Any `em` or `orm` use in `app`, or the global `orm.em` anywhere, is a blocker.
- A schema change comes as a new migration plus `.snapshot.json` plus `migrations/index.ts`, all committed together. An edited pushed migration is a blocker, and so is a drop or rename in the same release that stops using the old shape (see BACKWARD_COMPATIBILITY.md).
- A new service is one `asClass(X).scoped()` line in `container.ts` and one line in `cradle.ts`, and its constructor destructures the cradle. `CLASSIC` mode, `loadModules` and folder globbing are blockers.
- The container or ORM is never cached on `globalThis` under a string key (see the lesson on entity identity across Next.js bundles).
- MikroORM migrator calls are awaited one after another, never in `Promise.all`.
- Transactions are short and never await network I/O (SQLite has a single writer).
- Persisted files go under `config.dataDir` and nowhere else.

**UI**
- Admin pages compose shadcn/ui from `@cpg/ui`. Primitives are added with `npx shadcn@latest add`, never hand-written. Public pages use plain Tailwind. `import { cn } from "cn"` in generated components is correct.

**Tests**
- Database tests use a real SQLite file in `mkdtempSync(path.join(tmpdir(), …))` with migrations applied, not a mocked ORM. Mocks only at the boundaries (`next/*`, `@cpg/core` in app tests, the filesystem).
- Async server components are awaited before `render()`.
- Integration tests use their own agent-browser `--session` and read `eval` output with `--json`.
- Coverage thresholds, the coverage `exclude` list and `v8 ignore` comments are untouched unless the human approved it on the PR.

**Repo hygiene**
- New `.ai/` files follow `YYYY-MM-DD--HHMMUTC-slug.md`. A spec that is fully implemented moves to `.ai/specs/implemented/` in the same PR. A non-obvious pitfall fixed by the PR gets an entry in `.ai/lessons.md`.
- New dependencies: `npm audit` is triaged in the PR, and the dependency is justified (not ~20 lines of local code).
- The diff traces to its stated purpose: no drive-by renames or reformatting.

## Severity

| Severity | Meaning | Examples |
| --- | --- | --- |
| **blocker** | Must be fixed before merge | A failed validation command; coverage below 100%; a `(blocker)` item from the standards checklist; a broken BACKWARD_COMPATIBILITY surface; `em` used from `app`; an edited pushed migration |
| **major** | Fix in this PR unless the maintainer waives it on the PR | A `(major)` checklist item; missing integration test for a new page; a second inline implementation of a shared layer; a missing lesson for a fixed pitfall |
| **minor** | Should fix; may be deferred to a follow-up issue | Naming or placement drift; a weak assertion; an unclear *why* comment |
| **nit** | Optional | Wording, ordering |

Any blocker means **request changes**. Majors request changes unless they are explicitly waived. Minors and nits alone allow approval, with follow-ups filed through `om-followup-issue-from-pr`. Every finding cites the file and line and the rule behind it (this file, the standards doc, AGENTS.md or BACKWARD_COMPATIBILITY.md).

## Validation gate

A PR is not approvable until these commands pass (the same list as `.ai/agentic.config.json` and CI): `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npm run test:integration`.
