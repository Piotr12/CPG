# Backward compatibility

What this repository treats as a **protected contract surface**, and how a change to one must be made. Review skills (`om-code-review`, `om-auto-review-pr`) check every PR against this file; implementation skills warn when a change does not comply.

CPG has no external API consumers or published packages yet. What a careless change breaks today is the **production deployment**: every merge to `main` deploys to cpg.baby, and the SQLite database on the `/externaldata` volume outlives every container. Most surfaces below exist because of that.

## How a deploy overlaps old and new code

Kamal starts the new container while the old one is still serving. The new container applies pending migrations in `instrumentation.ts` before it answers `/up`, and kamal-proxy switches traffic only then. For a short window, **the old release runs against the new schema**. `kamal rollback` also runs the previous image against the already-migrated database, because migrations are never rolled back automatically.

So every schema and data change must keep the previous release working: **expand, then contract**, in separate deploys.

## Protected surfaces

### 1. Database schema and migrations

Source: `packages/db/src/entities/`, `packages/db/src/migrations/` (+ `.snapshot.json`, `migrations/index.ts`), the production file `/externaldata/cpg.sqlite`.

**Breaking:**
- editing, renaming, reordering or deleting a migration that has been pushed to `main`;
- dropping or renaming a table or column, or narrowing a column's type, in the same release that stops using it;
- adding a `NOT NULL` column without a default to a table that has rows;
- a migration that rewrites data so the previous release can no longer read it;
- changing the primary key or identity of an existing entity (e.g. `Setting.key`).

**Required path:**
1. Change schema only through a new migration (`npm run db:migration:create -- <name>`), committed with the snapshot and the regenerated `migrations/index.ts`.
2. Additive first: new tables, nullable or defaulted columns, new indexes. Ship the code that writes the new shape.
3. Remove or rename in a **later** PR, after the release that stopped reading the old shape has been live. Each step is its own deploy.
4. Every migration has a working `down()`, and its test covers up and down against a real SQLite file.
5. The PR is `risk-high` and its body carries a rollback note: what `kamal rollback` does against the migrated database.

### 2. Data directory and runtime configuration

Source: `packages/core/src/config.ts` (`loadConfig`), `Dockerfile`, `config/deploy.yml`.

| Contract | Current value |
| --- | --- |
| `DATA_DIR` | `/externaldata` in the image, bind-mounted from `/externaldata/cpg.baby` on the VM; `<repo>/data` locally |
| `DATABASE_FILE` | `cpg.sqlite` inside `DATA_DIR` |
| `DEBUG_SQL` | `1` logs SQL, development only |
| `CPG_ADMIN_PASSWORD` | Required by the server: the built-in admin's password, 12+ characters, no leading or trailing whitespace. Missing or invalid → the process exits at startup, so `/up` never turns healthy. Comes from `.kamal/secrets` / the GitHub Actions secret of the same name |
| Container user | uid 1001, which must be able to write `DATA_DIR` |
| Everything the app persists | under `DATA_DIR` |

**Breaking:** renaming or removing an environment variable, changing a default, moving a persisted file or directory inside `DATA_DIR`, writing anything persistent outside it, or changing the container user.

**Required path:** keep reading the old name or location as a fallback for at least one release, or ship a migration that moves the data. Update `config/deploy.yml`, `.kamal/secrets` and the Dockerfile in the same PR. A new required variable needs a safe default or a deploy-time check that fails before traffic switches.

### 3. Health check and container contract

Source: `packages/app/src/app/up/route.ts`, `Dockerfile`, `config/deploy.yml`.

`GET /up` returns `200` `text/plain` `OK` only after a database round trip through `systemStatusService.ping()`. kamal-proxy gates every deploy on it. The image listens on port 3000 and starts with `node packages/app/server.js`.

**Breaking:** changing the path, status or behaviour of `/up`, removing the database check (a broken data volume would then go live), adding authentication to it, or changing the port or start command without the matching `config/deploy.yml` change.

### 4. Public URLs

Source: `packages/app/src/app/`. Today that is:

- `/`, `/login` and `/help`, which are public. `/help` accepts `?q=` and anchors topics as `#<topic-id>`.
- `/admin` (the Global tenant chooser), `/admin/test` and `/admin/prod` (the tenant homes). Every tenant page lives under `/admin/{tenant}/`. All of them require an admin session and redirect to `/login` otherwise.

**Breaking:** removing or renaming a page URL users can bookmark, a help topic id, or the `q` parameter. **Required path:** a redirect from the old URL in the same PR, or a topic kept under its old id.

**Cookies** (`packages/app/src/auth/session-cookie.ts`, `packages/app/src/preferences/theme.ts`):

| Cookie | What it does | What renaming it would do |
| --- | --- | --- |
| `cpg_session` | the `httpOnly` session token | signs everyone out |
| `cpg_theme` | `light`/`dark`; read by the inline head script before first paint, deliberately not `httpOnly`, never trusted by the server | gives every user one flash of the light theme until they sign in again |

Rename either one only by reading the old name for one release.

Route handlers under `app/api/` are protected the same way: their paths, methods, request schemas, the result envelope (`{ ok, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`), error codes and HTTP statuses. Changes are additive (new optional fields, new routes), and removals go through a deprecation release. Today's routes:

- `GET /api/tenants`;
- `GET /api/tenants/{tenant}` (404 `TENANT_NOT_FOUND`).

Every tenant-scoped endpoint lives under `/api/tenants/{tenant}/`.

### 5. Commands used by CI, deploy and the docs

Source: root `package.json` scripts, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.ai/agentic.config.json`, `AGENTS.md`, `SDLC.md`.

**Breaking:** renaming or removing `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:coverage`, `test:integration`, `db:migrate` or `db:migration:create`. **Required path:** update every workflow, the config's `validation.commands`, `AGENTS.md` and `SDLC.md` in the same PR.

## Not protected

- **`@cpg/*` package exports.** The workspace packages are private, unpublished and consumed only inside this monorepo. Change them freely, but update every caller in the same PR (typecheck enforces it).
- **Domain event IDs** (`concept.entity.action`). They are in-process only, with no external subscribers. Revisit this if events ever leave the process (webhooks, a queue).
- **Internal file layout**, as long as `AGENTS.md` and the engineering standards stay accurate.

## Changing this document

Add a surface here in the same PR that creates it, for example the first `/api` route, the first webhook or the first exported file format.
