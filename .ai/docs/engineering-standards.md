# CPG — Engineering Standards & Package Structure

**Status:** active
**Adopted:** 2026-10-17, adapted from the DevMentor engineering standards (2026-09-01)

These rules apply to every change in this repository, by humans and agents. `AGENTS.md` holds the non-negotiable stack decisions and the `.ai/` workflow; this document covers how code is named, placed, layered, secured and reviewed. If the two disagree, `AGENTS.md` wins. Fix the disagreement in the same change.

CPG is an MRP II application. Its domain concepts are things like items, bills of materials, demand forecasts, production plans and work orders, served as a public frontend and an `/admin` backend. The examples below use those concepts. None of them exist yet, and a concept's folders are created only when its first file is written.

Section 6 lists every place where these standards deliberately differ from the DevMentor original.

---

## 1. Rules

### Naming

| Element | Convention | Example |
| --- | --- | --- |
| Package | `packages/<name>`, named `@cpg/<name>` | `@cpg/core` |
| Domain concept folder | plural, kebab-case, the same name in every layer and in the event namespace | `items`, `boms`, `work-orders` |
| File | kebab-case everywhere, including components (as shadcn generates them); the export inside is PascalCase/camelCase | `data-table.tsx` exports `DataTable` |
| Entity | `defineEntity` const + `InferEntity` type, both PascalCase singular, in `<name>.entity.ts` inside its concept folder | `WorkOrder` → `db/src/entities/work-orders/work-order.entity.ts` |
| DB table / column | snake_case, produced by MikroORM's default naming strategy (singular table from the entity name). Don't set `tableName` | `WorkOrder.dueDate` → `work_order.due_date` |
| Service | PascalCase class + `Service` suffix, `<name>.service.ts` | `WorkOrderService` → `core/src/services/work-orders/work-order.service.ts` |
| Domain logic (pure, no database) | camelCase functions, `<name>.ts` | `explodeBom()` → `core/src/domain/boms/explode-bom.ts` |
| Port (external integration interface) | PascalCase + `Port`/`Gateway` suffix, `<name>.port.ts` next to its service | `ErpExportPort` → `core/src/services/exports/erp-export.port.ts` |
| Adapter (port implementation) | PascalCase, adapter name first, under the service's `adapters/` | `CsvErpExport` → `core/src/services/exports/adapters/csv-erp-export.ts` |
| DI cradle key | camelCase of the class/value, one per dependency | `workOrderService: WorkOrderService` |
| Zod schema | camelCase + `Schema`, `<name>-<action>.schema.ts`, shared by client and server | `workOrderCreateSchema` → `core/src/validators/work-orders/work-order-create.schema.ts` |
| Event ID | `concept.entity.action`, past tense | `work-orders.work-order.released` |
| Server action | camelCase verb, in `actions.ts` next to the page that uses it | `releaseWorkOrder` |
| API route | one `route.ts` per resource under `app/api/<concept>/…` | `api/work-orders/[id]/release/route.ts` |
| Page | `<segment>/page.tsx`, default export `<Segment>Page` | `admin/work-orders/page.tsx` → `WorkOrdersPage` |
| Domain error | PascalCase + `Error`, extends `AppError`, in `core/src/http/errors.ts` | `NotFoundError`, `ConflictError` |

### Package layering

```
app ──▶ core ──▶ db
app ──▶ ui
db, ui ──▶ (no workspace packages)
```

- **`db`** holds persistence only: entities, migrations, the MikroORM config and `initOrm`/`migrate`, and the migration CLI (`@cpg/db/cli`). It takes plain `DbOptions` (`{ databasePath, debug }`) and knows nothing about the app config or DI. It is the only package that imports `@mikro-orm/*`, and it re-exports the types the others need (`Orm`, `EntityManager`, entity types).
- **`core`** holds business logic and the composition. That means config (`loadConfig`), the DI container (`container/container.ts` + `container/cradle.ts`, `getContainer`/`requestScope`), services, pure domain logic (MRP netting, BOM explosion, lot sizing, scheduling maths), Zod validators, the typed error hierarchy and result envelope, the event bus, ports and adapters. It is framework-agnostic: it never imports `next`, `react`, `@mikro-orm/*`, `@cpg/ui` or `@cpg/app`.
- **`ui`** holds generic, domain-agnostic presentation: shadcn primitives and the reusable `backend/` panel building blocks. It knows nothing about CPG's domain or any other `@cpg/*` package.
- **`app`** holds HTTP and rendering: pages, server actions, route handlers, domain-specific components and `instrumentation.ts`. It imports `@cpg/core` and `@cpg/ui`, never `@cpg/db`. It reads and writes data **only through services from the cradle**. A page, action or route never queries the `em`/`orm` directly.
- ESLint (`no-restricted-imports` in `eslint.config.mjs`) enforces these edges and the "no relative imports across packages" rule. Don't loosen them for convenience.

### Reusable server & UI layers

There will be many concepts, and the main risk is that each route, action and page re-invents validation, error handling and loading states slightly differently. Two shared layers exist to prevent that. **Each piece is built once, together with the first concept that needs it, and reused afterwards. A second inline implementation is a review blocker.** (None of them exist yet. See Section 5.)

**Server — `packages/core/src/http/`:**

- `errors.ts` — the typed error hierarchy: `AppError` base; `NotFoundError`, `ValidationError` (carries `fieldErrors`), `ConflictError`, `UnauthorizedError`, `ForbiddenError`. Services throw these. A service never builds a `Response`.
- `result.ts` — the one result envelope shared by route handlers and server actions: `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`.
- `server-action.ts` — wraps a server action. It parses the input with a Zod schema, maps thrown `AppError`s to the envelope, and logs anything else without leaking a stack trace. It is the default for mutations made from CPG's own pages.
- `api-handler.ts` — the same wrapper for route handlers (`Response.json` + status code). Use it for endpoints called from outside the app or fetched by client components.
- `make-crud-route.ts` — only once a plain-CRUD JSON API is genuinely needed. It takes a schema and service methods and returns `{ GET, POST, PUT, DELETE }`.
- `auth.ts` — `requireSession`, ownership/permission assertions. It arrives with authentication (see Security).

No action or route writes its own `try/catch` + response mapping.

**Client — `packages/ui/src/backend/`:**

- `api/api-call.ts` — the only place a client component calls `fetch()` on `/api/*`. It parses the envelope defensively and returns a typed `ApiResult<T>`, and `apiCallOrThrow` throws instead. `ui` declares its own `ApiResult` type with the same shape, because `ui` must not import `core`.
- `forms/crud-form.tsx` — a schema-driven form: fields, server `fieldErrors` next to the right field, submit/cancel/pending states, `Cmd/Ctrl+Enter` submits, `Escape` cancels. It is bound to a server action (or `apiCall`). Use it for every create/edit form, and write a bespoke form only when the UX isn't form-over-schema (e.g. a planning board).
- `tables/data-table.tsx` — column-config-driven lists with loading/empty/error states, pagination and row actions. Use it for every list screen.
- `feedback/{loading-message,error-message,empty-state}.tsx` — the only sanctioned loading/error/empty renderers, including `<Suspense>` fallbacks.

**Data flow in the App Router.** A server component reads through a service, `(await requestScope()).cradle.workOrderService.list()`. It never calls its own `/api` route (Next.js explicitly advises against that: it costs an extra request). Mutations from CPG pages go through server actions. Route handlers + `apiCall` are for client-side fetching and for external callers.

**Where a new component goes:**

1. shadcn primitive → `packages/ui/src/components/`, only via `npx shadcn@latest add <name>` in `packages/ui`, never hand-written.
2. A generic, concept-agnostic panel pattern (a new field type, table cell renderer or feedback state) → `packages/ui/src/backend/<category>/`.
3. A component tied to one concept's domain shape (renders a `WorkOrder`, a BOM tree) → `packages/app/src/components/<concept>/`, under the same concept name used in `db`/`core`.
4. A component used by exactly one page → colocated next to that `page.tsx`. Promote it to `components/<concept>/` when a second page needs it.

### Architecture

- **Concept folders are created only when their first file is added.** Never scaffold empty ones, and never create a `modules/<concept>/` directory, a per-concept `setup.ts`/`acl.ts` or any auto-discovery mechanism.
- **Explicit registration.** Every DI binding is one greppable line in `createAppContainer` (`core/src/container/container.ts`), and its type is one line in `Cradle` (`core/src/container/cradle.ts`). Never use Awilix `loadModules` or folder globbing. Services are `asClass(X).scoped()`, and take dependencies by destructuring the cradle in the constructor (`constructor({ em, config }: Deps)`). Injection mode is PROXY.
- **External integrations** (ERP export, e-mail, a supplier API, …) are reached through a **port interface in `core`**, with a mock/in-memory adapter first and the real adapter registered later without touching callers. Vendor SDKs stay out of `core`.
- **Domain events** use a lightweight typed emitter in `core/src/events/` (`event-bus.ts`, `event-map.ts`), registered as a singleton in the cradle and emitted by services after a successful mutation. They are in-process only: no queue or worker. Add it with the first concept that needs a side effect.
- **Shared Zod schemas** live in `core/src/validators/<concept>/`. The server action/route and the form both import the same schema. Client components import them through the `@cpg/core/validators/*` subpath export, never the `@cpg/core` barrel, which pulls in `node:fs`. Add `zod` and that export with the first schema.
- **Database reads in server components** call `await connection()` and sit inside `<Suspense>`. Never use `export const dynamic = "force-dynamic"` or other route-segment config: it doesn't exist under Cache Components. The app must build with no database present.
- **Check-then-write on shared state** (stock on hand, work-order status, planned-order release) runs inside one `em.transactional()` in the service, backed by a unique constraint where one applies. SQLite has a single writer: keep transactions short and never await a network call inside one.
- **Everything persisted** lives under `config.dataDir`. **Schema changes** go through migrations only (see `AGENTS.md`).

### Engineering principles

When two principles pull in different directions, prefer the one that keeps the change **smaller and more explicit**.

- **SRP — one file, one reason to change.** An entity file owns the schema, a service owns one concept's persistence workflow, a domain function owns one calculation, and an action/route owns the HTTP wiring (parse → authorize → service → envelope). `work-order.service.ts` decides whether a work order can be released. It never builds a response, and the action never contains that check inline.
- **DRY — one definition, every call site imports it.** One Zod schema per input, one error/envelope mapping, one feedback component per state. If you are about to copy a `try/catch` or a validation block, extract it.
- **Separation of concerns — layers don't leak.** Persistence stays in `db`, business rules in `core` (services + pure domain functions), HTTP/rendering in `app`, generic presentation in `ui`.
- **Dependency inversion — depend on a port, not a vendor SDK.** Awilix wires the chosen adapter at startup. Only `db` is coupled to MikroORM.
- **Explicit over implicit.** A new service is a new line in `container.ts` and in `cradle.ts`, never discovered from a folder scan.
- **Convention over configuration, applied consistently.** The concept-folder convention replaces a module system. It only works if every concept follows it.
- **YAGNI.** Don't build a layer, folder, dependency or option before the change that uses it.
- **Composition over inheritance.** Prefer small services and functions composed together over base classes with template methods.
- **Fail closed.** An error inside an authorization or validation decision means deny, never allow.
- **Idempotency where retries can happen.** Releasing a work order, posting a stock movement or importing a forecast must tolerate being submitted twice (a double-click, a retried request) without doing the work twice. Use a transaction plus a unique constraint, not only an application-level check.

### Security & validation — minimum requirements

CPG has no authentication yet, so **`/admin` is currently public**. Authentication needs its own spec in `.ai/specs/` (mechanism, users, roles). Until it exists, nothing sensitive goes into `/admin`. Once it exists, the following hold regardless of the mechanism chosen:

- **Passwords** (if stored): `argon2id` (memory ≥ 19 MiB, iterations ≥ 2, parallelism 1) or `bcrypt` with cost ≥ 12. Don't pick a third option.
- **Sessions:** a server-side session or a signed token (HS256+, secret ≥ 32 random bytes) in an `httpOnly`, `secure` (production), `sameSite=lax` cookie with a scoped `path` and a short expiry. Never use `localStorage` or a non-httpOnly cookie. Document missing refresh/rotation as a known limitation rather than silently lengthening the expiry.
- **Server-side enforcement:** every non-public page, action and route checks the session itself. Hiding a button is not enforcement.
- **Record-level authorization:** check access to *this* record (no insecure direct object references). A missing ownership/permission check is as serious as a missing auth check.
- **CSRF:** server actions get Next.js's built-in Origin check. Cookie-authenticated route handlers that change state also require a custom header, which `apiCall` always sets and a plain HTML form post can't.
- **Brute force:** login, registration and password reset get an attempt counter per IP + account with a cooldown. An in-memory counter is acceptable at first, noted as needing a shared store before scaling out.
- **Generic auth errors** ("invalid credentials"). Never reveal whether an account exists.
- **No mass assignment:** writes use the Zod-parsed, explicitly typed output, never the raw request body spread into `em.create()`/`em.assign()`, so a client can't set `id`, `status` or another record's foreign key.
- **No injection:** persistence goes through MikroORM's entity/query APIs. Raw SQL only with bound parameters, never with interpolated input. User input never reaches a shell command or a file path without canonicalization (stay inside `config.dataDir`).
- **Server-side recomputation:** quantities, costs and dates derived from master data (BOM cost roll-up, MRP net requirements, scheduled dates) are always recomputed on the server. A client-supplied total is never trusted or persisted as-is.
- **IDs:** new entities use a UUID primary key. Human-facing business keys (item code, work-order number) are separate unique columns. Small configuration tables keyed by a stable natural key (like `Setting.key`) are the exception.
- **Secrets:** secrets come only from the environment and are read and validated in `loadConfig`. They live in `.kamal/secrets` (which only references env vars, never values) and GitHub Actions secrets, and `.env*` stays git-ignored. Nothing logs or returns a password, token, session ID or secret.
- **Dependency hygiene:** run `npm audit` before finishing and triage every new advisory (see `AGENTS.md`). Don't add a dependency for something ~20 lines of local code covers.

### Code quality

- No `any` (lint error). Narrow `unknown` at runtime instead.
- Self-documenting code. Comments explain a non-obvious *why*. The existing doc-comment style on exported functions stays.
- Three similar lines are fine. A copy-pasted block with branching logic is not: extract it.
- One function, one job, one level of abstraction. Handle errors and empty paths early with returns instead of nesting `if`s.
- No empty `catch`: handle, log with context, or rethrow.
- No magic numbers or strings: name the constant and say why the value was chosen (e.g. a planning horizon of 12 weeks).
- Booleans read positively (`isReleased`, not `!isNotReleased`). Replace a bare `true`/`false` argument with a named option or a separate function.
- No dead code, commented-out code or debug `console.log` (ESLint allows only `console.info`/`warn`/`error`). Logging that needs structure or redaction gets a shared logger in `core` when the first such need appears.
- A diff traces entirely to its stated purpose: no drive-by renames or formatting passes.

### Code review checklist

**Structure & conventions**

- [ ] Concept folders follow the naming table, with the same name in every layer. No entity without the service that owns it, and no service without its entity (cross-cutting services like `system` excepted).
- [ ] No import breaks the package layering (ESLint passes), and no code reaches into another concept's internals instead of its service.
- [ ] Pages/actions/routes go through services, never `em`/`orm`.
- [ ] Actions/routes use the shared wrappers, forms use `CrudForm`, lists use `DataTable` and states use the `feedback/` components. A bespoke alternative needs a stated reason.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.

**Security** (apply in full once authentication exists)

- [ ] Auth is enforced server-side on every non-public page, action and route. (blocker)
- [ ] Authorization checks the specific record. (blocker)
- [ ] Check-then-write on shared state runs in a transaction and/or behind a unique constraint. (blocker)
- [ ] No secret, token or password in logs, errors or client payloads. (blocker)
- [ ] No untrusted input reaches a query, shell command or file path unparameterized/uncanonicalized. (blocker)
- [ ] Writes use a Zod-parsed explicit shape, with no mass assignment. (blocker)
- [ ] Errors around a security decision fail closed. (blocker)
- [ ] Cookie flags are preserved whenever auth-cookie code changes. (major)
- [ ] A security bug fix ships with a regression test that fails without the fix. (major)
- [ ] Login/registration/reset changes keep brute-force protection. (major)

**Correctness & tests**

- [ ] Concurrency-sensitive flows (stock, releases, imports) have a test of the concurrent/repeated case, not only the happy path.
- [ ] Anything client-supplied that affects quantities, costs or record ownership is revalidated on the server.
- [ ] A behaviour change ships a test that fails on the old code, and a bug fix ships a regression test. (Package-level test infrastructure arrives with the first domain logic. Today `npm test` runs `tests/**/*.test.mts` with `node --test`.)

---

## 2. Adding a new domain concept

Example: "add work orders". Create each file only when the change needs it.

1. **Entity:** `packages/db/src/entities/work-orders/work-order.entity.ts`. Add it to `entities/index.ts`, then `npm run db:migration:create -- <name>` and commit the migration, snapshot and index together.
2. **Pure rules** (if any): `packages/core/src/domain/work-orders/*.ts`, with tests.
3. **Validation:** `packages/core/src/validators/work-orders/work-order-<action>.schema.ts`. This is required once there is any create/update input.
4. **Service:** `packages/core/src/services/work-orders/work-order.service.ts`. Register it in `core/src/container/container.ts` (`workOrderService: asClass(WorkOrderService).scoped()`) and add it to `Cradle` in `core/src/container/cradle.ts`. Export it from `core/src/index.ts`. It throws `AppError`s and runs check-then-write in `em.transactional()`. Entity types and `EntityManager` come from `@cpg/db`, never from `@mikro-orm/*`.
5. **Events** (if a side effect is needed): add `work-orders.work-order.<action>` to `core/src/events/event-map.ts` and emit it from the service after the mutation succeeds.
6. **HTTP surface:**
   - From CPG's own pages, a server action in `actions.ts` next to the page, wrapped in the shared `server-action` helper.
   - For external callers or client fetching, `app/src/app/api/work-orders/…/route.ts` via `apiHandler` (or `makeCrudRoute` for plain CRUD).
   - Authentication checks come first, once auth exists.
7. **Pages:** backend screens under `app/src/app/admin/work-orders/` (shadcn via `@cpg/ui`), public ones under `app/src/app/` (plain Tailwind).
   - Read in a server component through the service, with `await connection()` inside `<Suspense>` and a `feedback/` fallback.
   - Forms use `CrudForm` bound to the schema from step 3, through a small client component in `app/src/components/work-orders/` (a Zod schema can't be passed as a prop from a server component).
   - Lists use `DataTable`.
   - Before writing a component, check `ui/src/backend/` and `app/src/components/work-orders/`.

---

## 3. Target package structure

These are illustrative paths. They appear only as concepts are implemented.

```
packages/
  app/src/
    app/
      page.tsx                                   # public frontend (plain Tailwind)
      admin/
        page.tsx                                 # backend (shadcn)
        work-orders/{page.tsx,actions.ts}
      api/<concept>/…/route.ts                   # only for external callers / client fetching
      up/route.ts                                # kamal-proxy health check
    components/<concept>/                        # domain-specific components
    instrumentation.ts                           # startup migrations (migrateDatabase)
  core/
    scripts/migrations.ts                        # `npm run db:migrate` / `db:migration:create`
    src/
      config.ts  database.ts  singleton.ts
      container/{container,cradle}.ts            # composition root, getContainer/requestScope
      http/{errors,result,server-action,api-handler,make-crud-route,auth}.ts
      events/{event-bus,event-map}.ts
      services/<concept>/<name>.service.ts
      services/<concept>/<name>.port.ts  services/<concept>/adapters/<name>.ts
      domain/<concept>/<name>.ts                 # pure MRP logic
      validators/<concept>/<name>-<action>.schema.ts
  db/src/
    entities/<concept>/<name>.entity.ts  entities/index.ts
    migrations/
    config.ts  orm.ts  cli.ts
  ui/src/
    components/                                  # shadcn primitives only
    backend/{api,forms,tables,feedback}/         # generic panel building blocks
    lib/  styles/globals.css
```

---

## 4. How it is enforced

- `eslint.config.mjs` enforces the package layering, the ban on relative imports across packages and `@mikro-orm/*` outside `db`, `no-explicit-any` and `no-console` (except `info`/`warn`/`error`).
- `AGENTS.md` makes reading this document part of the workflow, and its verification step runs lint, typecheck, tests, build and `npm audit` triage.
- Review uses the checklist in Section 1.

## 5. Adoption status (2026-10-17)

Done when these standards were adopted:

- `Setting` moved to `db/src/entities/settings/setting.entity.ts` (table name unchanged, so no migration).
- The first service, `SystemStatusService` (`core/src/services/system/`), is registered in `core/src/container/container.ts`. `/admin` and `/up` read through it instead of querying the ORM. It is the reference for service placement and registration.
- ESLint boundaries added.
- Layering switched to DevMentor's `app → core → db` (the first version of this document kept CPG's original `db → core`). Config and DI moved fully into `core`, the composition root moved from `app/src/server/container.ts` into `core`, and the migration CLI entry point moved to `core/scripts/`. `db` now has no workspace dependencies.

Deliberately **not built yet** (YAGNI). Each arrives with the first concept that needs it, and that concept's change is the reference implementation:

- `core/src/http/*`
- `ui/src/backend/*`
- `core/src/events/*`
- `core/src/validators/*` (+ `zod`)
- `core/src/domain/*`
- a shared logger
- authentication

Known `npm audit` state: 10 high advisories, all from `braces` (GHSA-vfj7-8cjw-p6xm, no patched version) via `fast-glob`. That reaches the app only through `awilix` (`loadModules`, which this project never calls). Otherwise it is dev tooling (`eslint-config-next`, `shadcn`). `npm audit fix --force` would downgrade `awilix` to 6.0.0: don't. Re-check when `braces` ships a fix.

## 6. Deviations from the DevMentor original

| DevMentor | CPG | Why |
| --- | --- | --- |
| `app` may import `db` (not stated) | `app` imports only `core` and `ui`; ESLint forbids `@cpg/db` in `app` | Makes "pages go through services" enforceable rather than a convention. |
| Every page fetches through `apiCall` → `/api` route; `/admin/users` rewritten that way | Server components read through services; mutations via server actions; `apiCall` only in client components | Next.js docs: "do not call Route Handlers from Server Components". The App Router with Cache Components makes the client-fetch-everything pattern redundant. |
| `export const dynamic = "force-dynamic"` for DB routes | `await connection()` inside `<Suspense>` | Route-segment `dynamic` is removed under Cache Components (`cacheComponents: true`). |
| Concept components in `ui/src/components/<concept>/`, primitives in `components/ui/` | Concept components in `app/src/components/<concept>/`; primitives stay in `ui/src/components/` | `ui` has no access to domain types and is domain-agnostic. The shadcn aliases already target `ui/src/components/`. |
| Ports in `services/<concept>/`, adapters in `services/<concept>/adapters/` | Same, plus pure domain functions in `core/src/domain/<concept>/` | MRP logic is mostly pure computation, which tests best as plain functions. |
| Mixed file casing (`apiHandler.ts`, `CrudForm.tsx`, `mentor-card.tsx`) | kebab-case for every file | The original contradicted itself. shadcn generates kebab-case. |
| Plural table names | MikroORM's default singular snake_case | Avoids a `tableName` on every entity and a rename migration for the existing `setting` table. |
| JWT HS256 + bcrypt, `env.ts` with zod, `pino` | Auth mechanism decided in a future spec (minimums kept); config via `loadConfig`; no logger until needed | CPG has no auth, zod or logger yet, and adding them speculatively breaks YAGNI. |
| Persona route groups `(student)`, `(mentor)`, …; bookings, payments, slot races, money | Public frontend vs `/admin` backend; MRP concepts; stock/release races, recomputed quantities/costs | Different product. The underlying rules carry over unchanged. |
| `npm audit` as a gate | `npm audit` triage | It currently reports 10 unfixable dev-tooling/unused-path advisories, so a hard gate would block every deploy. |
| `docs/product-scope.md` "no DI container" fix | Not applicable | CPG has no such document. Awilix is already a stack decision in `AGENTS.md`. |
