# Lessons learned

Long-term memory for AI agents working on this project. **Read this before starting any task.**

Add an entry after fixing a bug, hitting a non-obvious pitfall, or discovering anything worth remembering. Update or delete entries that turn out to be wrong. One bullet per lesson, grouped by topic:

```markdown
- **YYYY-MM-DD — <short title>** — <what happened / what to do instead>. [details](lessons/YYYY-MM-DD--HHMMUTC-slug.md)
```

The `[details]` link is optional — add a file in [`lessons/`](lessons/) only when the lesson needs a longer write-up.

## General

- **2026-10-17 — Docker `npm ci` tries to compile better-sqlite3** — npm runs `node-gyp rebuild` because the package has a `binding.gyp`, which fails without Python/a compiler. better-sqlite3 ships prebuilt binaries (musl included), so the Dockerfile uses `npm ci --ignore-scripts`.
- **2026-10-19 — Name a function `useX` only if it is a React hook** — `react-hooks/rules-of-hooks` treats every `useX()` call as a hook, even in a plain helper or a test, and fails lint ("called in function … that is neither a component nor a hook"). That is why `useTenant` became `selectTenant`.
- **2026-10-19 — MikroORM filters and the flush don't see every write** — the `tenant` filter covers `find*`, `count`, populate, `nativeUpdate` and `nativeDelete`, and `TenantGuard` sees only flushes. These bypass both:
  - `insert`/`upsert`/`clone`;
  - the QueryBuilder: its root, `from()` with an entity or a raw table name (any case), `clone()`, and joins;
  - `getDriver()` and `addFilter()`;
  - `nativeUpdate` data with a relation key or a raw column name (MikroORM passes unknown keys through as SQL).

  The same holds for a global entity that references tenant data. `TenantEntityManager` refuses these at runtime for every entity that touches tenant data, but joins and raw SQL can't be fully checked there, so ESLint bans the QueryBuilder, the driver, `addFilter` and raw SQL in `core`/`app`. After a MikroORM upgrade, re-read the `EntityManager` write methods and run `packages/db/src/tenants/tenant-isolation.test.ts`.
- **2026-10-17 — shadcn v4 imports `cn` from the `cn` npm package** — `import { cn } from "cn"` in generated components is correct, not a broken alias. The `new-york` style is legacy; this repo uses `radix-nova`.

## Testing

- **2026-10-17 — Root-level config files are `.mts`** — the root `package.json` has no `"type"`, so Vite loads `vitest.config.ts` as CommonJS and warns. Name root-level ESM files `.mts` (`vitest.config.mts`, `vitest.integration.config.mts`). Root tests (`tests/*.test.ts`) run through Vitest, so `.ts` is fine there.
- **2026-10-17 — `tmpdir()` can be inside the repo** — cezar points `TMPDIR` at `.ai/cezar/tmp/…`, so a temp dir has the monorepo as an ancestor. Don't assume a temp dir is outside the workspace; use the filesystem root when a test needs "no workspace above me".
- **2026-10-17 — Don't run MikroORM migrator calls concurrently** — `getExecuted()` and `getPending()` each create `mikro_orm_migrations` if missing, and under `Promise.all` on a never-migrated database the second one fails with "table already exists". Await them one after the other (there is one SQLite connection anyway).
- **2026-10-17 — React DOM can't render async server components** — React suspends forever on them and Testing Library only shows the `<Suspense>` fallback. Call the page function and await its async children before `render()` (`resolveServerComponents` in `app/src/app/admin/page.test.tsx`).
- **2026-10-17 — Testcontainers `withBuildkit()` fails on this repo** — the build stops with "failed to read dockerfile: archive/tar: invalid tar header". The default (classic) builder builds the Dockerfile fine; `tests/integration/global-setup.ts` uses it.
- **2026-10-19 — `agent-browser wait --fn` needs a boolean** — an expression that returns a DOM element (`document.querySelector(…) || …`) fails with "CDP error: Object reference chain is too long". Wrap it: `!!document.querySelector(…)`.
- **2026-10-19 — React 19: updates after `await` leave the transition** — inside `startTransition(async () => { await x; setState(…) })` the `setState` commits outside the transition, so an error can show while `isPending` is still true (a flaky "button still says Saving…" test). Wrap post-await updates in another `startTransition` (see `ui/src/backend/forms/crud-form.tsx`).
- **2026-10-17 — Reading output from agent-browser** — `get text`/`get title` print plain text, but `eval` prints pretty-printed JSON or a quoted string. Use `--json eval` and read `.data.result` (the `evaluate()` helper in `tests/integration/browser.ts`). Give each test its own `--session` so parallel tests never share a page.

- **2026-10-19 — Integration test files share one admin account** — every file signs in as the single built-in admin, so a file that changes the admin's language or theme leaked into files running beside it. `vitest.integration.config.mts` runs files one at a time (`fileParallelism: false`), and a file that changes preferences restores them in `afterAll` (`restoreDefaultPreferences`). Revisit once E01-S02 lets a file create its own account.
- **2026-10-19 — agent-browser can click before React hydrates** — a click on the static HTML of a streamed page is silently lost, and a wait on state the static shell already shows (`<html lang="en">`) passes too early. Wait until the target element has a `__reactFiber` key, then wait for server-rendered state such as `aria-pressed` (`choosePreference` in `tests/integration/sign-in.ts`).
- **2026-10-19 — `agent-browser wait --fn` must not return a DOM element** — the result is serialized over CDP, and a hydrated element (React fiber attached) intermittently fails with "Object reference chain is too long". When that hit `restoreDefaultPreferences`, the admin stayed in Polish and the next file failed on English text. `waitUntil` in `tests/integration/browser.ts` now wraps every expression in `Boolean(…)`.
- **2026-10-19 — A hook must not return a function by accident** — `beforeEach(() => mock.mockResolvedValue(x))` returns the mock, and Vitest runs a function returned from a hook as its teardown, so the mock fires after the test and a rejecting mock fails it with a confusing stack. Give hooks a block body: `beforeEach(() => { … })`.

## Next.js

- **2026-10-17 — Kill the whole server before runtime checks** — `pkill -f "next start"` misses the `next-server` child it spawns, which keeps the port, so later curl checks silently hit the old build. Check `lsof -nP -iTCP:<port> -sTCP:LISTEN` is empty before starting a server and after stopping it.
- **2026-10-17 — Patterns from pre-Cache-Components projects don't transfer as-is** — `export const dynamic = "force-dynamic"` no longer exists (use `await connection()` + `<Suspense>`), and server components must not fetch the app's own `/api` routes (Next.js docs: extra request). Read through services; mutate through server actions. Check imported standards against `node_modules/next/dist/docs/` before adopting them.
- **2026-10-17 — One ORM per bundle, keyed by entity identity** — Next.js gives route handlers, pages and instrumentation separate copies of `@cpg/db`, and MikroORM matches entities by object identity. Never cache the container/ORM on `globalThis` under a string key; `getContainer()` (in `@cpg/core`) keys it by the `entities` array. [details](lessons/2026-10-17--0920UTC-mikroorm-entity-identity-next-bundles.md)
- **2026-10-17 — Next.js 16 icon `<link>`s differ from its docs** — `app-icons.md` says `favicon.ico` gets `sizes="any"`, but the build emits the ICO's largest image (`sizes="48x48"`) and a content-hash query on every icon `href`. Before relying on documented metadata output, check `.next/server/app/index.html` after `npm run build`, and pin the observed tags in an integration test (`tests/integration/app-icons.test.ts`).
- **2026-10-19 — The standalone server doesn't exit when `register()` throws** — `node server.js` (the Docker image) logs "Failed to prepare server" and answers every request with a 500. Only `next start` exits. A startup check that must stop the app calls `process.exit(1)` itself (`packages/app/src/instrumentation.ts`), and an integration test proves the container exits (`tests/integration/startup-guard.test.ts`).
- **2026-10-19 — With Partial Prefetching, `notFound()` on an unlisted dynamic param answers HTTP 200** — since Next 16.3, a param missing from `generateStaticParams` gets the route's App Shell first, so the layout's `notFound()` streams the 404 UI with `<meta name="robots" content="noindex">` and can't change the status (`streaming.md`, "The HTTP contract").
  - `dynamicParams` is unavailable under Cache Components.
  - `ensureStatic = 'navigation'` forbids `connection()` and DB reads.
  - Test the not-found UI and `noindex`, not the status code (`tests/integration/tenants.test.ts`). Route handlers still answer real 404s.
- **2026-10-19 — Moving a page into a route group can trip `no-html-link-for-pages` elsewhere** — once `/admin` lived under `admin/(global)/`, the rule started flagging a `<a href="/admin">` in a `ui` package test. Use external URLs in tests of generic link components.
- **2026-10-17 — Dynamic `fs` paths make Turbopack trace the whole project** — paths built from env/`process.cwd()` pull every source file into the standalone output. Mark them with `/* turbopackIgnore: true */` (see `packages/core/src/config.ts`).

## Agent pipeline (om-* skills)

- **2026-10-19 — Never delete the `qa-evidence` branch** — PR comments embed screenshots and mockups from `raw.githubusercontent.com/<repo>/qa-evidence/<slug>/…`. Deleting the branch, or a folder in it, silently breaks the images in every old comment. Cleaning up the old per-PR `qa-evidence-*` branches did exactly that, so evidence now lives in one long-lived orphan branch (`attach-image-evidence` in `.ai/trackers/github.md`).

- **2026-10-19 — Never name a zsh variable `path`** — zsh ties the lowercase `path` array to `PATH`, so `path="x/y.png"` inside a loop (as in the descriptor's `attach-image-evidence` snippet) wipes `PATH`, and every later command fails with "command not found". Run such snippets under `bash -c` or use another name.
- **2026-10-17 — zsh doesn't word-split `$cmd`** — `for c in "npm run lint" …; do $c; done` runs `"npm run lint"` as one command name under zsh, so every step exits 127 and the gate looks broken. Run such loops under `bash -c`, or use `eval "$c"`.
- **2026-10-17 — Load `PIPELINE_LABELS` before `set_pipeline_label`** — the GitHub descriptor's guard removes the competing pipeline labels listed in `$PIPELINE_LABELS`. Unset, it silently only adds the new label, leaving two pipeline labels on the PR. Set `PIPELINE_LABELS="$(jq -r '.labels.pipeline | join(" ")' .ai/agentic.config.json)"` (and `LABELS_ENABLED`) before sourcing the guards.
- **2026-10-17 — The pipeline can't approve its own PRs** — the om-* skills run as the human's GitHub account (Piotr12), so GitHub rejects approve/request-changes on PRs they opened, and self-approval must not be worked around. Post the review as a PR comment, keep the PR in `review` (never `merge-queue`), and leave approval to a human. A bot account or GitHub App token would remove the limit.
- **2026-10-17 — macOS has no `timeout`** — `timeout 2400 gh run watch …` exits 127 at once. Use the tool's own timeout or a background `gh run watch --exit-status`.
- **2026-10-17 — Keep same-day semantics when overriding om-* slot checks** — matching a run by slug across all dates made any old merged run with the same slug block a new one and route it to `om-auto-continue-pr`. Match `$(date -u +%Y-%m-%d)--????UTC-<slug>`, the date-scoped rule the installed skills use.
- **2026-10-17 — Ignore `.ai/tmp/` in git and ESLint** — om-* skills create full-repo worktrees there. Without the ignores, the main checkout shows them as untracked (a `git add -A` would stage an embedded repo) and `npm run lint` lints their files. ESLint 9 does not read `.gitignore`, so the entry in `globalIgnores` is needed too.
