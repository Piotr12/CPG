# AGENTS.md

Instructions for every AI agent (Claude Code, Codex, Cursor, …) working in this repository. `CLAUDE.md` only imports this file — keep all agent rules here. The one other `AGENTS.md`, in `packages/app/`, holds the block `next dev` maintains there (imported by `packages/app/CLAUDE.md`).

## Engineering standards

[`.ai/docs/engineering-standards.md`](.ai/docs/engineering-standards.md) defines naming, package layering, where new code goes, the reusable server/UI layers, security minimums, code quality rules and the review checklist. **Read it before adding or moving code**, and review your diff against its checklist. ESLint enforces the package boundaries.

## Stack and architecture — non-negotiable

These are the project's architectural decisions. Follow them; do not introduce alternatives (another ORM, DI library, CSS framework or component kit, package manager) without the human's explicit approval.

- **Next.js 16 (App Router, Turbopack, Cache Components) + React 19 + TypeScript (strict)**, always on the latest stable versions. This Next.js has breaking changes versus your training data: read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- **npm workspaces monorepo.** Every package lives in `packages/` and is named `@cpg/<name>`. Packages export their TypeScript source directly (`exports` → `./src/…`, no build step); Turbopack transpiles them. Never use relative imports across packages.

  | Package | Contains | May depend on |
  | --- | --- | --- |
  | `packages/app` (`@cpg/app`) | The Next.js application: routes, pages, server actions, domain-specific components, startup migrations (`src/instrumentation.ts`) | `core`, `ui` |
  | `packages/core` (`@cpg/core`) | Framework-agnostic business layer: config (`loadConfig`), the DI composition root (`container/container.ts`, `container/cradle.ts`, `getContainer`/`requestScope`), services, pure domain logic, validators, errors, events, ports, the migration CLI entry point | `db` |
  | `packages/db` (`@cpg/db`) | Persistence only: MikroORM config, entities, migrations, `initOrm`/`migrate`. Takes plain `DbOptions`, knows nothing about config or DI. The only package that imports `@mikro-orm/*` | — |
  | `packages/ui` (`@cpg/ui`) | Reusable, domain-agnostic UI: shadcn/ui components, generic `backend/` panel blocks, `cn`, theme and Tailwind entry CSS | — |

- **Database: SQLite through MikroORM 7** (`@mikro-orm/sqlite`, better-sqlite3 driver).
  - Define entities with `defineEntity` (no decorators) and list them in `packages/db/src/entities/index.ts`.
  - Change the schema **only through migrations**: edit the entity → `npm run db:migration:create -- <name>` → commit the migration, `.snapshot.json` and the regenerated `migrations/index.ts` together. Never edit a migration that has been pushed; never use `schema:update` against a real database.
  - Migrations run automatically when the server starts (`instrumentation.ts`); `npm run db:migrate` runs them by hand.
  - Query through the request-scoped `em` (`(await requestScope()).cradle.em`), never the global `orm.em`.
  - SQLite allows one writer at a time, so the "pool" is a single better-sqlite3 connection per ORM, running in WAL mode. Keep transactions short.
- **All persisted files go under `config.dataDir`** (`DATA_DIR`): the database and every other file the app writes (uploads, exports, …). The container filesystem is thrown away on every deploy. Production: `/externaldata` in the container, bind-mounted from `/externaldata/cpg.baby` on the VM (`config/deploy.yml`). Locally: `<repo>/data/` (gitignored).
- **Domain concepts are folders, not modules.** Each concept (`items`, `boms`, `work-orders`, …) is a same-named kebab-case folder repeated across the layers that need it: `db/src/entities/<concept>/<name>.entity.ts`, `core/src/services/<concept>/<name>.service.ts`, `core/src/domain/<concept>/`, `core/src/validators/<concept>/`, `app/src/components/<concept>/`, `app/src/app/admin/<concept>/`. Create a concept folder only with its first file. There is no per-concept setup, ACL or auto-discovery. Pages, server actions and route handlers read and write **only through services** (`(await requestScope()).cradle.<name>Service`), never through `em`/`orm` directly.
- **Reusable layers, built once.** Server: `core/src/http/` (`AppError` hierarchy, result envelope, server-action and route-handler wrappers). Client: `ui/src/backend/` (`apiCall`, `CrudForm`, `DataTable`, loading/error/empty states). Each piece is built with the first concept that needs it and reused from then on. Never re-implement one inline. Domain events use the typed in-process emitter in `core/src/events/` with IDs named `concept.entity.action`.
- **Dependency injection: Awilix** in `PROXY` injection mode, `strict` on. Every binding is one explicit line in `core/src/container/container.ts` and its type one line in `cradle.ts` (no `loadModules`); services are `asClass(X).scoped()`. Services take dependencies by destructuring the cradle (`({ em, config }) => …`), which keeps working after minification; never use `CLASSIC` mode. Resolve only in server code, through `getContainer()` / `requestScope()` from `@cpg/core`.
- **Styling.** Frontend (public) pages: plain **Tailwind CSS 4** utilities. Backend (admin) pages under `/admin`: compose **shadcn/ui** components from `@cpg/ui` (`radix-nova` style), and add missing ones with `npx shadcn@latest add <component>` in `packages/ui` rather than hand-writing them. Theme tokens live in `packages/ui/src/styles/globals.css`, the single Tailwind entry point.
- **Server components that read the database** must call `await connection()` and sit inside a `<Suspense>` boundary (Cache Components would otherwise try to prerender them at build time).
- **Testing: Vitest** for unit tests (with React Testing Library + jsdom for components) and for integration tests, which run the app's production Docker image through **Testcontainers** and drive it with **agent-browser**. The rules are in [Testing](#testing--mandatory) below.
- **Commands** (from the repo root): `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run test:integration`, `npm run db:migrate`, `npm run db:migration:create -- <name>`.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, unit tests with coverage, build and integration tests on every pull request. `deploy.yml` calls the same workflow, so nothing deploys unless it passes.
- **Deployment:** pushing to `main` deploys with Kamal from GitHub Actions. kamal-proxy only switches traffic once `/up` answers, and `/up` queries the database.

## Testing — mandatory

- **Every new feature, bug fix and behaviour change ships with unit tests that cover 100% of the code it adds or changes: lines, branches, functions and statements.** No exceptions for "simple" code, glue code, pages or components. `npm run test:coverage` fails below 100% across `packages/*/src` and `packages/*/scripts`, and CI runs it on every pull request. A change that drops coverage is not done.
- **Never lower the thresholds, widen the coverage `exclude` list or add `/* v8 ignore */` (or similar) comments** without the human's explicit approval. If code is hard to test, restructure it (inject the dependency, extract a pure function) rather than excluding it.
- **Tests check behaviour, not just lines.** Every test asserts on outcomes; a test that only executes code to reach the number doesn't count. A bug fix ships a regression test that fails without the fix.
- **Where tests go.** Next to the code they cover: `<name>.test.ts` (runs in Node) or `<name>.test.tsx` (React, runs in jsdom with Testing Library). Repo-wide checks go in `tests/*.test.ts`.
- **Mock only at the boundaries**: Next.js APIs (`next/server`, `next/font/*`), `@cpg/core` in app tests, and the filesystem where the real one would be written. Database code runs against a real SQLite file in a temp directory (`mkdtempSync(path.join(tmpdir(), …))`) with the migrations applied. Async server components are awaited before rendering (see `app/src/app/admin/page.test.tsx`).
- **Integration tests** (`tests/integration/*.test.ts`, `npm run test:integration`) build the production `Dockerfile`, start it with Testcontainers on an empty data directory (so the app migrates a fresh SQLite database) and drive it in Chrome through `agent-browser` (the `openBrowser()` helper in `tests/integration/browser.ts`). Every user-visible page or flow gets at least one. They need Docker and `npx agent-browser install`; set `CPG_BASE_URL=http://localhost:3000` to run them against a server that is already running.

## The `.ai/` metadata folder

All AI working metadata lives in `.ai/`. Using it is **mandatory**, not optional.

```
.ai/
├── README.md
├── docs/                            # standing project documents (engineering-standards.md, …)
├── specs/                           # SDD specifications (written by the human, implemented by agents)
│   ├── README.md
│   ├── YYYY-MM-DD--HHMMUTC-slug.md  # active specs — not yet fully implemented
│   ├── implemented/                 # specs that have been fully implemented
│   │   └── README.md
│   └── archive/                     # specs that were superseded, abandoned or rejected
│       └── README.md
├── runs/                            # one log per autonomous AI run
│   ├── README.md
│   └── YYYY-MM-DD--HHMMUTC-slug.md
├── lessons.md                       # long-term memory: index of lessons learned
├── lessons/                         # long-form write-ups linked from lessons.md
│   ├── README.md
│   └── YYYY-MM-DD--HHMMUTC-slug.md
├── agentic.config.json              # om-* agent pipeline config (see "Agent pipeline" below)
├── pipeline/runs/                   # om-* execution plans and run folders
├── skills/                          # repo-local overrides of the om-* skills
├── trackers/ browsers/              # tracker (GitHub) and browser (agent-browser) descriptors
└── analysis/ scripts/ qa/           # om-* reports, test-env scripts, QA state
```

`.ai/cezar/` is local state of the cezar cockpit — it is gitignored; never edit or commit it.

### Agent pipeline (om-* skills)

The open-mercato om-* skills (`.agents/skills/`, symlinked into `.claude/skills/`) run the issue → PR → review → QA → merge flow. [`SDLC.md`](SDLC.md) describes that flow, [`CODE_REVIEW.md`](CODE_REVIEW.md) adds review rules on top of the engineering-standards checklist, and [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md) lists the protected contract surfaces. Their settings live in `.ai/agentic.config.json`. Never edit the vendored skills in `.agents/skills/`. Put repo-specific changes in `.ai/skills/<skill-name>/SKILL.md` ([README](.ai/skills/README.md)); those overrides make the skills follow the naming convention below. The rules in this file still apply to om-* runs. An om-* execution plan in `pipeline/runs/` is that run's run log (see "Before starting any task").

### Naming convention

Every file in `specs/` (and its subfolders), `runs/` and `lessons/` is named `YYYY-MM-DD--HHMMUTC-slug.md`:

- `YYYY-MM-DD--HHMMUTC` — the date and time the file was **created**, in **UTC**, 24-hour clock, with a double hyphen before the time and the literal `UTC` suffix. Never changed afterwards, even when a spec is moved. Get it with `date -u +%Y-%m-%d--%H%MUTC`.
- `slug` — short, lowercase, kebab-case description, e.g. `2026-10-17--1432UTC-user-login.md`.
- If the name is already taken, append a counter: `2026-10-17--1432UTC-user-login-2.md`.

Each entry directly inside `pipeline/runs/` follows the same rule: a flat plan file, or a run folder named the same way without `.md` (its files keep fixed names such as `PLAN.md`).

The exceptions are `README.md` files, `.ai/docs/` (standing documents with stable names, updated in place), and the files the om-* skills keep in `specs/` under fixed names: `product-brief.md`, `backlog.md`, `assets/` and `research/`. `npm test` enforces this rule, and CI runs it on every pull request and before every deploy.

## Mandatory workflow

### 1. Before starting any task

1. **Read `.ai/lessons.md`** and open any linked lesson relevant to the task. Do not repeat a mistake that is already recorded there. For any code change, also read `.ai/docs/engineering-standards.md`.
2. **Check `.ai/specs/`** for a spec covering the task. If one exists, it is the source of truth — implement what it says. If the task conflicts with the spec, stop and ask the human instead of guessing.
3. **If this is an autonomous run** (you are working without a human approving each step — e.g. dispatched by cezar, a scheduled/automated job, a headless session), **create the run log** `.ai/runs/YYYY-MM-DD--HHMMUTC-slug.md` right away (template below). Exception: when an om-* skill writes an execution plan for the run (`om-auto-create-pr`, `om-auto-create-pr-loop`, `om-auto-continue-pr`), that plan in `.ai/pipeline/runs/` **is** the run log. Don't create a second one; the plan, its Progress section and the PR's summary comment carry what the template asks for. Every other autonomous run, including om-* skills that write no plan, still logs in `.ai/runs/`.
4. **Plan complex tasks before writing code** (multi-file changes, new features, bugs with an unclear cause). Write down the steps, the files you will touch and how you will verify the result — in the run log, or shown to the human in an interactive session. Aim for a plan good enough to implement in one pass. Resolve ambiguity by asking, not by guessing.

### 2. While working

- Keep the run log up to date as you go (decisions, deviations from the spec, blockers) — not only at the end, so an interrupted run still leaves a trail.
- Do not rewrite the intent of a spec. Specs are authored by the human. You may tick off checklist items or add an `## Implementation notes` section; anything that changes scope must be raised with the human.
- **When things go sideways, stop and re-plan** instead of piling on patches. Record in the run log why the first approach failed.
- **Fix bugs end-to-end yourself.** Given a bug report, failing check or log, reproduce it, find the root cause and fix it — read the logs and code rather than asking the human how.
- **Keep your context clean**: delegate broad searches and independent side tasks to subagents when your tool supports them.
- If you find yourself repeating the same multi-step workflow, propose turning it into a skill or command committed to the repo.

### 3. Before finishing

1. **Verify your changes — never claim "done" without evidence.** At minimum run `npm run lint`, `npm run typecheck`, `npm run test:coverage` (100% required), `npm run build` and `npm run test:integration`. If dependencies changed, run `npm audit` too and triage every advisory not already listed as known in the standards doc. For UI or route changes, run the app (`npm run dev`) and check the actual behaviour. Record what you ran and what it printed; if something could not be verified, say so explicitly.
2. **Raise the bar**: review your own diff against the checklist in `.ai/docs/engineering-standards.md` and ask, *"knowing everything I know now, is there a simpler, more elegant solution?"* If so, replace the hacky fix before handing over.
3. **Finalize the run log**: outcome, what changed, how it was verified, follow-ups.
4. **Record lessons**: after **every correction from the human**, after fixing a bug, hitting a non-obvious pitfall, or discovering something worth remembering long-term, add an entry to `.ai/lessons.md` (see format below). Phrase it as a rule that prevents the mistake from happening again; if it is a standing project rule, propose adding it to this file instead. Update or remove entries that turned out to be wrong.
5. **Move the spec** once it is fully implemented and verified: `git mv .ai/specs/<file> .ai/specs/implemented/`. Superseded or abandoned specs go to `.ai/specs/archive/` (add a one-line note at the top of the spec saying why).
6. Commit the `.ai/` changes together with the code they describe.

## Templates

### Spec — `.ai/specs/YYYY-MM-DD--HHMMUTC-slug.md`

```markdown
# <Title>

**Status:** draft | ready | in progress | implemented | archived
**Created:** YYYY-MM-DD HH:MM UTC

## Goal
## Context
## Requirements
- [ ] ...
## Out of scope
## Acceptance criteria
```

### Run log — `.ai/runs/YYYY-MM-DD--HHMMUTC-slug.md`

```markdown
# <Title>

**Date:** YYYY-MM-DD HH:MM UTC
**Agent:** <tool / model>
**Spec:** <path to spec, or "none">
**Status:** in progress | done | partial | failed | blocked

## Goal
## Log
- <timestamped notes: steps taken, decisions, deviations>
## Changes
- <files / commits>
## Verification
- <commands run and their results>
## Follow-ups
```

### Lesson — entry in `.ai/lessons.md`

```markdown
- **YYYY-MM-DD — <short title>** — <what happened / what to do instead, one or two sentences>. [details](lessons/YYYY-MM-DD--HHMMUTC-slug.md)
```

Keep `lessons.md` short and scannable — one bullet per lesson, grouped by topic. When a lesson needs more than a couple of sentences (root cause analysis, reproduction steps, code samples), write it up in `.ai/lessons/YYYY-MM-DD--HHMMUTC-slug.md` and link it from the bullet.
