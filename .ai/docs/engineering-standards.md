# CPG — Engineering Standards & Package Structure

**Status:** active
**Adopted:** 2026-10-17, adapted from the DevMentor engineering standards (2026-09-01)

These rules apply to every change in this repository, by humans and agents. `AGENTS.md` holds the non-negotiable stack decisions and the `.ai/` workflow; this document covers how code is named, placed, layered, secured and reviewed. If the two disagree, `AGENTS.md` wins. Fix the disagreement in the same change.

CPG is an MRP II application. Its domain concepts are things like materials, bills of materials, demand forecasts, production plans and production orders, served as a public frontend and an `/admin` backend. Code names follow the PRD's terms (brief Q04): `materials`, not items; `production-orders`, not work orders. Section 5 lists the implemented concepts. A concept's folders are created only when its first file is written.

Section 6 lists every place where these standards deliberately differ from the DevMentor original.

---

## 1. Rules

### Naming

| Element | Convention | Example |
| --- | --- | --- |
| Package | `packages/<name>`, named `@cpg/<name>` | `@cpg/core` |
| Domain concept folder | plural, kebab-case, the same name in every layer and in the event namespace | `materials`, `boms`, `production-orders` |
| File | kebab-case everywhere, including components (as shadcn generates them); the export inside is PascalCase/camelCase | `data-table.tsx` exports `DataTable` |
| Entity | `defineEntity` const + `InferEntity` type, both PascalCase singular, in `<name>.entity.ts` inside its concept folder | `ProductionOrder` → `db/src/entities/production-orders/production-order.entity.ts` |
| DB table / column | snake_case, produced by MikroORM's default naming strategy (singular table from the entity name). Don't set `tableName` | `ProductionOrder.dueDate` → `production_order.due_date` |
| Service | PascalCase class + `Service` suffix, `<name>.service.ts` | `ProductionOrderService` → `core/src/services/production-orders/production-order.service.ts` |
| Domain logic (pure, no database) | camelCase functions, `<name>.ts` | `explodeBom()` → `core/src/domain/boms/explode-bom.ts` |
| Port (external integration interface) | PascalCase + `Port`/`Gateway` suffix, `<name>.port.ts` next to its service | `ErpExportPort` → `core/src/services/exports/erp-export.port.ts` |
| Adapter (port implementation) | PascalCase, adapter name first, under the service's `adapters/` | `CsvErpExport` → `core/src/services/exports/adapters/csv-erp-export.ts` |
| DI cradle key | camelCase of the class/value, one per dependency | `productionOrderService: ProductionOrderService` |
| Zod schema | camelCase + `Schema`, `<name>-<action>.schema.ts`, shared by client and server | `productionOrderCreateSchema` → `core/src/validators/production-orders/production-order-create.schema.ts` |
| Event ID | `concept.entity.action`, past tense | `production-orders.production-order.released` |
| Server action | camelCase verb, in `actions.ts` next to the page that uses it | `releaseProductionOrder` |
| API route | one `route.ts` per resource under `app/api/<concept>/…` | `api/production-orders/[id]/release/route.ts` |
| Page | `<segment>/page.tsx`, default export `<Segment>Page` | `admin/production-orders/page.tsx` → `ProductionOrdersPage` |
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

There will be many concepts, and the main risk is that each route, action and page re-invents validation, error handling and loading states slightly differently. Two shared layers exist to prevent that. **Each piece is built once, together with the first concept that needs it, and reused afterwards. A second inline implementation is a review blocker.** (Section 5 lists which exist.)

**Server — `packages/core/src/http/`:**

- `errors.ts` — the typed error hierarchy: `AppError` base; `NotFoundError`, `ValidationError` (carries `fieldErrors`, and optional `messageParams` for what a field message refers to), `ConflictError`, `UnauthorizedError`, `ForbiddenError`. Services throw these. A service never builds a `Response`.
- `result.ts` — the one result envelope shared by route handlers and server actions: `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors?, params? } }`.
- `server-action.ts` — wraps a server action. It parses the input with a Zod schema, maps thrown `AppError`s to the envelope, and logs anything else without leaking a stack trace. It is the default for mutations made from CPG's own pages.
- `api-handler.ts` — the same wrapper for route handlers (`Response.json` + status code). Use it for endpoints called from outside the app or fetched by client components. Core builds it with `createApiHandler(rethrow)`; routes import `apiHandler` from `app/src/routing/api-handler.ts`, which passes Next.js's `unstable_rethrow` so `redirect()`, `notFound()` and the build-time prerender bail-out propagate instead of being logged as a 500. ESLint stops `app` code from importing `createApiHandler` anywhere else.
- **Every state-changing route** (`POST`/`PUT`/`PATCH`/`DELETE`) is built with `apiWrite`, or `tenantApiWrite` under `api/tenants/[tenant]/` (`app/src/auth/api-write.ts`, spec `2026-10-19--1548UTC-api-idempotency`).
  - It requires the bearer token, an `Idempotency-Key` and a JSON body, and for tenant routes the `Dataset-Generation`.
  - It runs the handler through `IdempotencyService.run`, which stores the key in the same transaction as the write.
  - The handler writes only through the `cradle` it is handed, never its own `requestScope()`. `tests/api-writes.test.ts` enforces both rules.
- **Versioned records.** An entity that two sessions can edit from a loaded copy declares `version: p.integer().version()`. Its service compares the caller's version against a fresh read in its transaction and maps MikroORM's `OptimisticLockError` to `ConflictError(…, "VERSION_CONFLICT")`. `UserService` is the reference.
- `make-crud-route.ts` — only once a plain-CRUD JSON API is genuinely needed. It takes a schema and service methods and returns `{ GET, POST, PUT, DELETE }`.
- `auth.ts` — `assertSignedIn(user)` and `assertAdmin(user)` on a validated `Actor` (a session's `SessionUser` or an API token's `ApiActor`), for actions and routes: they throw `UnauthorizedError` or `ForbiddenError` inside the wrapper, after parsing. Reading the session cookie can't live in `core` (it needs `next/headers`): `app/src/auth/` holds the cookie helpers and the `requireUser()`/`requireAdmin()` page gates, which validate through `AuthService`.

No action or route writes its own `try/catch` + response mapping.

**Client — `packages/ui/src/backend/`:**

- `api/api-call.ts` — the only place a client component calls `fetch()` on `/api/*`. It parses the envelope defensively and returns a typed `ApiResult<T>`, and `apiCallOrThrow` throws instead. `ui` declares its own `ApiResult` type with the same shape in `api/result.ts`, because `ui` must not import `core`.
- `forms/crud-form.tsx` — a schema-driven form: fields, server `fieldErrors` next to the right field, submit/cancel/pending states, `Cmd/Ctrl+Enter` submits, `Escape` cancels. It is bound to a server action (or `apiCall`). Use it for every create/edit form, and write a bespoke form only when the UX isn't form-over-schema (e.g. a planning board).
- `tables/data-table.tsx` — column-config-driven lists with loading/empty/error states, pagination and row actions. Use it for every list screen.
- **List sort and search** (#217). A list sorts and searches **in its service, across every page**, never in the browser: `listSortSchema(KEYS)` and `searchSchema` (`core/src/validators/lists/`), `searchWhere(q, fields)` and `listOrderBy(field, dir)` (`core/src/domain/lists/`, the business ID as tie-breaker, a reference by its `code`; a stored decimal-text quantity as `{ decimal: "quantity" }`, which orders by value through `decimalLengthKey` in `@cpg/db`, the only raw SQL it exports for queries, #224; a computed figure such as an outstanding amount isn't sortable). Lists sorted after reading compare quantities with `compareDecimals`. The page reads the URL with `readSearch`/`readSort`/`listLinks` (`app/src/components/lists/list-params.ts`) and renders `ListSearchBar` above a `DataTable` whose columns carry `sortKey` and whose searched cells use `Highlight` (`ui/src/backend/tables/`). `?q=&sort=&dir=&page=`; the default order stays out of the address. Materials is the reference.
- `forms/autocomplete.tsx` — the one combobox, for a choice from a list too long for a select (every material picker in an entry form; `CrudField` `type: "autocomplete"`). It refuses text that isn't a choice. GET filter forms keep `NativeSelect`, which works before hydration.
- **Units** come from the registry in `core/src/validators/units/unit-registry.ts` wherever a record gets a unit it doesn't have yet (a base unit, a conversion); offer them with `unitChoices`/`unitSelect` (`app/src/components/units/`). Never a free-text unit field.
- `feedback/{error-message,error-summary,empty-state,loading-message}.tsx` — the only sanctioned loading/error/empty renderers, including `<Suspense>` fallbacks. `LoadingMessage` is a language-neutral skeleton for request-time page content. `ErrorSummary` holds errors a page can open with (a refused bookmarked filter): it takes focus on mount (unless the reader is already in a field), because an alert already in the page at load isn't announced by every screen reader.

**Language, theme and help** (spec `2026-10-19--0855UTC-user-preferences-footer-help`):

- **Strings.** Every user-visible string lives in `app/src/i18n/messages/en.ts`. `pl.ts` is typed against it, so a missing Polish string fails `typecheck`.
- **Where translated text renders.** Server components read the dictionary with `getMessages()`, inside the request-time `<Suspense>` child that already gates the page's data, and wrap their output in `lang={locale}`.
  - Static shells and `<Suspense>` fallbacks hold no translatable text: use a text-free `aria-busy` placeholder.
  - Client components get their strings as props.
- **Errors** are translated by envelope `code` through `errorMessage()`.
- **Theme.** The theme is the `dark` class on `<html>`. The inline head script sets it before first paint from the `cpg_theme` cookie, and `DocumentPreferences` keeps it in line with the account.
  - The account's `user_preference` row is the source of truth.
  - `cpg_theme` is the one deliberately script-readable cookie: a display hint, never read for a server decision.
- **Footer.** The root layout ends every page with the R11 footer. Never add a second `<footer>`.
- **Help.** Every new `page.tsx` adds a help topic for its route in both languages (`app/src/help/topics.ts`). `tests/every-page-has-help.test.ts` enforces it.

**Data flow in the App Router.** A server component reads through a service, `(await requestScope()).cradle.productionOrderService.list()`. It never calls its own `/api` route (Next.js explicitly advises against that: it costs an extra request). Mutations from CPG pages go through server actions. Route handlers + `apiCall` are for client-side fetching and for external callers.

**Where a new component goes:**

1. shadcn primitive → `packages/ui/src/components/`, only via `npx shadcn@latest add <name>` in `packages/ui`, never hand-written.
2. A generic, concept-agnostic panel pattern (a new field type, table cell renderer or feedback state) → `packages/ui/src/backend/<category>/`.
3. A component tied to one concept's domain shape (renders a `ProductionOrder`, a BOM tree) → `packages/app/src/components/<concept>/`, under the same concept name used in `db`/`core`.
4. A component used by exactly one page → colocated next to that `page.tsx`. Promote it to `components/<concept>/` when a second page needs it.

### Architecture

- **Concept folders are created only when their first file is added.** Never scaffold empty ones, and never create a `modules/<concept>/` directory, a per-concept `setup.ts`/`acl.ts` or any auto-discovery mechanism.
- **Explicit registration.** Every DI binding is one greppable line in `createAppContainer` (`core/src/container/container.ts`), and its type is one line in `Cradle` (`core/src/container/cradle.ts`). Never use Awilix `loadModules` or folder globbing. Services are `asClass(X).scoped()`, and take dependencies by destructuring the cradle in the constructor (`constructor({ em, config }: Deps)`). Injection mode is PROXY.
- **External integrations** (ERP export, e-mail, a supplier API, …) are reached through a **port interface in `core`**, with a mock/in-memory adapter first and the real adapter registered later without touching callers. Vendor SDKs stay out of `core`.
- **Domain events** use a lightweight typed emitter in `core/src/events/` (`event-bus.ts`, `event-map.ts`), registered as a singleton in the cradle and emitted by services after a successful mutation. They are in-process only: no queue or worker. Add it with the first concept that needs a side effect.
- **Shared Zod schemas** live in `core/src/validators/<concept>/`. The server action/route and the form both import the same schema. Client components import them through the `@cpg/core/validators/*` subpath export, never the `@cpg/core` barrel, which pulls in `node:fs`. Add `zod` and that export with the first schema.
- **Database reads in server components** call `await connection()` and sit inside `<Suspense>`. Never use `export const dynamic = "force-dynamic"` or other route-segment config: it doesn't exist under Cache Components. The app must build with no database present.
- **Check-then-write on shared state** (stock on hand, production-order status, planned-order release) runs inside one `em.transactional()` in the service, backed by a unique constraint where one applies. SQLite has a single writer: keep transactions short and never await a network call inside one.
  - **Never hold SQLite's write lock across slow async work** (an argon2 hash, a file read). Each Next.js bundle has its own connection, and better-sqlite3 waits for a lock synchronously, so a second connection blocks the whole event loop until `busy_timeout`. Do the slow work first, then the writes.
  - **A transaction around services** opens on the request's own `em` with `inRequestTransaction` (`core/src/http/request-transaction.ts`), so their `flush()` and `transactional()` join it. `em.transactional()` on a request fork would put the transaction on a child fork the services never see.
- **Exact quantities (R03).** Quantities and conversion factors are decimal strings, stored as text columns (SQLite's numeric affinity would make `0.333333` a binary REAL) and exchanged as JSON strings. All arithmetic goes through `core/src/domain/quantities/decimal.ts` (`bigint` micro-units, one half-up rounding to six decimals). Never `Number(quantity)`, a `float` column or a JSON number.
- **A business ID assigned in sequence** (the eight-digit material ID) is the tenant's highest + 1, read in the write's transaction, behind a tenant-local unique index. Two such writes racing on two connections meet SQLite's stale-snapshot refusal, which `tenantServerAction` and `IdempotencyService` retry once, so both succeed.
- **Masters that are only an ID, a name and an active flag** (locations, customers, suppliers) share one shape and one set of rules: `namedRecordDefinition()` in `db/src/entities/named-records/`, and the `NamedRecords` helper in `core/src/services/named-records/`, which each kind's service holds and delegates to (composition, not a base class). Their screens are `components/named-records/`. A new master of that shape adds a kind; it doesn't copy a service.
- **Everything persisted** lives under `config.dataDir`. **Schema changes** go through migrations only (see `AGENTS.md`).
- **Tenant isolation (R05).** Business data belongs to Test or Prod (spec `2026-10-19--0913UTC-test-prod-tenants`). Every entity is either declared with `tenantOwned()` (`db/src/entities/tenants/tenant-owned.ts`) or listed in `GLOBAL_ENTITIES` (accounts, sessions, settings, tenants, the Global audit); `tests/tenant-ownership.test.ts` enforces it.
  - **The tenant comes from the request, explicitly.** Pages under `app/admin/[tenant]/`, route handlers under `app/api/tenants/[tenant]/`, and server actions bound to the page's tenant through `tenantServerAction`. All of them resolve `tenantScope(code)` from `@cpg/core` (`tests/tenant-entry-points.test.ts`). There is no tenant cookie and no tenant on the session.
  - **A plain `requestScope()` has no tenant.** Reading a tenant-owned entity there throws.
  - **`@cpg/db` enforces the rest at runtime.**
    - The default-on `tenant` filter scopes every read, `nativeUpdate` and `nativeDelete`.
    - `TenantGuard` rejects a flush that touches another tenant's record, or a reference that wasn't loaded through the scope. That includes references held by global records.
    - `TenantEntityManager` covers every entity that touches tenant data: tenant-owned ones, and global ones referencing them. For those it refuses:
      - `insert`, `insertMany`, `upsert`, `upsertMany`, `clone` and `countBy`;
      - the QueryBuilder as a root, and through `from()` (clones included, raw table names matched case-insensitively);
      - a `nativeUpdate` that sets anything but plain fields.
  - **Writes go through `em.create`/`assign`/`remove` and a flush.** Services never set `tenant`, because it is filled on create.
  - **Client-supplied references are loaded with `findOneOrFail` in the scope.** A Prod ID used in Test is then "not found" (TEN-014).
  - **A read-only tenant refuses every business write** (R05, spec `2026-10-19--2018UTC-read-only-tenants`). The flag is read fresh inside the write's transaction, by `tenantServerAction` and by `IdempotencyService` behind `tenantApiWrite`. A system write outside them, such as a demo seed, checks `isScopeReadOnly(em)` itself. Tenant pages hide their write controls while the tenant is read-only, and the read-only banner says why.
  - **Tenant-local unique keys include `tenant`.**
  - **ESLint forbids, in `core` and `app`, what the runtime can't fully see:**
    - `filters` options;
    - `setFilterParams`/`selectTenant` outside `tenantScope`;
    - `addFilter`, `getDriver` and the QueryBuilder (`createQueryBuilder`, `qb`);
    - raw SQL (`execute`, `getKysely`).

    `tests/tenant-lint.test.ts` proves each rule fires.

- **Audit (R08).** Every change is recorded in an append-only audit (spec `2026-10-19--1050UTC-audit-log`): account-level changes in the Global audit (`GlobalAuditEvent`), tenant records in that tenant's audit (`TenantAuditEvent`, tenant-owned).
  - **Every mutating service method takes an `actor: AuditActor`.** Actions build it from the validated session with `uiActor(user)`; API routes build it with `apiActor(…)`, which names the token (never its secret).
  - **The service records the entry itself**, with `recordGlobalAudit(em, actor, entry)` or `recordTenantAudit(…)` on the EntityManager it writes with. The entry then commits or rolls back with the change. Never record from an event handler: events fire after the commit.
  - **Snapshots are explicit allowlists** of the entity's fields, never the whole entity. The recorder refuses keys that look like secrets (`password`, `hash`, `secret`), but the allowlist is the real protection. It also refuses a field `AUDIT_FIELDS` doesn't list, because the audit screens must name every field in EN and PL (UX-022).
  - **A write that changes nothing records nothing.** Action IDs follow the event naming (`concept.entity.action`).
  - **Nothing updates an entry; Global and Prod entries are never deleted.** Entity-level triggers enforce it in SQLite, audit routes export only `GET`, and `tests/audit-append-only.test.ts` scans core/app. The sole planned exception is now implemented: `db/src/tenants/reset-test-data.ts` clears Test audit with all Test-owned data during the atomic admin reset. That helper requires Test scope and an active transaction; it cannot clear Prod or Global audit.

### Engineering principles

When two principles pull in different directions, prefer the one that keeps the change **smaller and more explicit**.

- **SRP — one file, one reason to change.** An entity file owns the schema, a service owns one concept's persistence workflow, a domain function owns one calculation, and an action/route owns the HTTP wiring (parse → authorize → service → envelope). `production-order.service.ts` decides whether a production order can be released. It never builds a response, and the action never contains that check inline.
- **DRY — one definition, every call site imports it.** One Zod schema per input, one error/envelope mapping, one feedback component per state. If you are about to copy a `try/catch` or a validation block, extract it.
- **Separation of concerns — layers don't leak.** Persistence stays in `db`, business rules in `core` (services + pure domain functions), HTTP/rendering in `app`, generic presentation in `ui`.
- **Dependency inversion — depend on a port, not a vendor SDK.** Awilix wires the chosen adapter at startup. Only `db` is coupled to MikroORM.
- **Explicit over implicit.** A new service is a new line in `container.ts` and in `cradle.ts`, never discovered from a folder scan.
- **Convention over configuration, applied consistently.** The concept-folder convention replaces a module system. It only works if every concept follows it.
- **YAGNI.** Don't build a layer, folder, dependency or option before the change that uses it.
- **Composition over inheritance.** Prefer small services and functions composed together over base classes with template methods.
- **Fail closed.** An error inside an authorization or validation decision means deny, never allow.
- **Idempotency where retries can happen.** Releasing a production order, posting a stock movement or importing a forecast must tolerate being submitted twice (a double-click, a retried request) without doing the work twice. Use a transaction plus a unique constraint, not only an application-level check.

### Security & validation — minimum requirements

Authentication is server-side sessions (specs `2026-10-19--0746UTC-admin-sign-in` and `2026-10-19--0912UTC-user-management`): the built-in admin and normal users sign in at `/login`, a random token goes into the `httpOnly` `cpg_session` cookie, and only its SHA-256 is stored. Every `/admin` page calls `requireUser()`, or `requireAdmin()` when it is admin-only, inside the `<Suspense>` child that renders its data. `tests/admin-pages-require-admin.test.ts` enforces both and keeps the list of admin-only pages. Nothing renders outside the gate. The following hold:

- **Passwords** (if stored): `argon2id` (memory ≥ 19 MiB, iterations ≥ 2, parallelism 1) or `bcrypt` with cost ≥ 12. Don't pick a third option. CPG uses argon2id through Node's built-in `crypto.argon2` (`core/src/services/auth/password-hash.ts`, PHC strings), which is why `engines.node` is `>=24.7` and `assertServerConfig` refuses older runtimes.
- **API tokens** (spec `2026-10-19--1053UTC-api-tokens`): every route handler starts with `requireApiUser(request)` (`app/src/auth/require-api-user.ts`).
  - An `Authorization: Bearer` header authenticates through `ApiTokenService` only, never falling back to the cookie.
  - Without one, the session cookie is accepted for `GET`/`HEAD` only, so no cookie-authenticated route changes state and none needs a CSRF header.
  - Tokens are `cpg_` + 32 random bytes, stored as their SHA-256. They carry the owner's current role and never expire.
  - Tokens are created only by the tokens screen's server action, from a cookie session: `ApiTokenService.create` takes a `SessionUser`, and `tests/api-token-minting.test.ts` pins the single caller (R07).
  - A password reset or deactivation deletes the user's tokens with their sessions. A changed `CPG_ADMIN_PASSWORD` deletes the admin's at startup.
- **Sessions:** a server-side session or a signed token (HS256+, secret ≥ 32 random bytes) in an `httpOnly`, `secure` (production), `sameSite=lax` cookie with a scoped `path` and a short expiry. Never use `localStorage` or a non-httpOnly cookie. (The non-sensitive `cpg_theme` display hint is the only script-readable cookie.) Document missing refresh/rotation as a known limitation rather than silently lengthening the expiry.
- **Server-side enforcement:** every non-public page, action and route checks the session itself. Hiding a button is not enforcement.
- **Record-level authorization:** check access to *this* record (no insecure direct object references). A missing ownership/permission check is as serious as a missing auth check.
- **CSRF:** server actions get Next.js's built-in Origin check. Cookie-authenticated route handlers that change state also require a custom header, which `apiCall` always sets and a plain HTML form post can't.
- **Brute force:** login, registration and password reset get an attempt counter per IP + account with a cooldown. An in-memory counter is acceptable at first, noted as needing a shared store before scaling out.
- **Generic auth errors** ("invalid credentials"). Never reveal whether an account exists.
- **No mass assignment:** writes use the Zod-parsed, explicitly typed output, never the raw request body spread into `em.create()`/`em.assign()`, so a client can't set `id`, `status` or another record's foreign key.
- **No injection:** persistence goes through MikroORM's entity/query APIs. Raw SQL only with bound parameters, never with interpolated input. User input never reaches a shell command or a file path without canonicalization (stay inside `config.dataDir`).
- **Server-side recomputation:** quantities, costs and dates derived from master data (BOM cost roll-up, MRP net requirements, scheduled dates) are always recomputed on the server. A client-supplied total is never trusted or persisted as-is.
- **IDs:** new entities use a UUID primary key. Human-facing business keys (material ID, production-order number) are separate unique columns. Small configuration tables keyed by a stable natural key (like `Setting.key`) are the exception.
- **Secrets:** secrets come only from the environment, are read in `loadConfig` and are validated for the server in `assertServerConfig` (called first in `instrumentation.ts`, which exits the process on failure). They live in `.kamal/secrets` (which only references env vars, never values) and GitHub Actions secrets, and `.env*` stays git-ignored. Nothing logs or returns a password, token, session ID or secret.
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
- [ ] Uses tokens and components from the design system (spec `2026-10-24--0842UTC-design-system-v1`); no new palette classes, radius, size or spacing values; states use `StatusBadge` or `Callout`; copy is plain. `tests/design-tokens.test.ts` fails on an offender outside the spec's Exceptions table.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build` and `npm run test:integration` pass in CI, which runs them all on the pull request. Locally the author runs the first four and only the integration files the change touches.

**Security** (apply in full once authentication exists)

- [ ] Auth is enforced server-side on every non-public page, action and route. (blocker)
- [ ] Authorization checks the specific record. (blocker)
- [ ] Check-then-write on shared state runs in a transaction and/or behind a unique constraint. (blocker)
- [ ] Tenant data is reached only through `tenantScope`. New entities are `tenantOwned()` or deliberately global, nothing bypasses the tenant filter or guard, and references are loaded in the scope. (blocker)
- [ ] No secret, token or password in logs, errors or client payloads. (blocker)
- [ ] No untrusted input reaches a query, shell command or file path unparameterized/uncanonicalized. (blocker)
- [ ] Writes use a Zod-parsed explicit shape, with no mass assignment. (blocker)
- [ ] Every mutating service method takes an `actor` and records its audit entry in the same flush or transaction, with an allowlisted snapshot that holds no secret. (blocker)
- [ ] Errors around a security decision fail closed. (blocker)
- [ ] Cookie flags are preserved whenever auth-cookie code changes. (major)
- [ ] A security bug fix ships with a regression test that fails without the fix. (major)
- [ ] Login/registration/reset changes keep brute-force protection. (major)

**Correctness & tests**

- [ ] Concurrency-sensitive flows (stock, releases, imports) have a test of the concurrent/repeated case, not only the happy path.
- [ ] Anything client-supplied that affects quantities, costs or record ownership is revalidated on the server.
- [ ] Every line, branch and function the change adds or touches is covered by unit tests, and coverage is still 100%. (blocker)
- [ ] No coverage threshold lowered, no coverage `exclude` widened and no `v8 ignore` comment added without the human's approval. (blocker)
- [ ] Tests assert on behaviour. A behaviour change ships a test that fails on the old code, and a bug fix ships a regression test.
- [ ] A new user-visible page or flow has an integration test in `tests/integration/`.

---

## 2. Adding a new domain concept

Example: "add production orders". Create each file only when the change needs it.

1. **Entity:** `packages/db/src/entities/production-orders/production-order.entity.ts`, declared with `tenantOwned()` unless it is genuinely global (then add it to `GLOBAL_ENTITIES`). Add it to `entities/index.ts`, then `npm run db:migration:create -- <name>` and commit the migration, snapshot and index together.
2. **Pure rules** (if any): `packages/core/src/domain/production-orders/*.ts`, with tests.
3. **Validation:** `packages/core/src/validators/production-orders/production-order-<action>.schema.ts`. This is required once there is any create/update input.
4. **Service:** `packages/core/src/services/production-orders/production-order.service.ts`. Register it in `core/src/container/container.ts` (`productionOrderService: asClass(ProductionOrderService).scoped()`) and add it to `Cradle` in `core/src/container/cradle.ts`. Export it from `core/src/index.ts`. It throws `AppError`s and runs check-then-write in `em.transactional()`. Entity types and `EntityManager` come from `@cpg/db`, never from `@mikro-orm/*`.
5. **Events** (if a side effect is needed): add `production-orders.production-order.<action>` to `core/src/events/event-map.ts` and emit it from the service after the mutation succeeds.
6. **HTTP surface:**
   - From CPG's own pages, a server action in `actions.ts` next to the page, wrapped in the shared `server-action` helper. For tenant data, it uses `tenantServerAction`, and the page binds its tenant with `action.bind(null, tenant)`.
   - For external callers or client fetching, `app/src/app/api/production-orders/…/route.ts` via `apiHandler` (or `makeCrudRoute` for plain CRUD).
   - Authentication checks come first, once auth exists.
7. **Pages:** tenant screens under `app/src/app/admin/[tenant]/production-orders/`, read through `tenantScope(tenant)`; global backend screens under `app/src/app/admin/(global)/`. Both use shadcn via `@cpg/ui`. Public pages go under `app/src/app/` (plain Tailwind on the design tokens); they may use the `@cpg/ui` controls `Button`, `Input` and `Label`. The one exception is the navigation the root layout renders on every page (`app/src/components/layout/`): the sidebar a signed-in account sees, and the visitor bar a visitor sees, are built from `@cpg/ui` (`Sidebar`, `Collapsible`, `Popover`, `Button`) on public pages too.
   - Read in a server component through the service, with `await connection()` inside `<Suspense>` and a `feedback/` fallback.
   - Forms use `CrudForm` bound to the schema from step 3, through a small client component in `app/src/components/production-orders/` (a Zod schema can't be passed as a prop from a server component).
   - Lists use `DataTable`.
   - Before writing a component, check `ui/src/backend/` and `app/src/components/production-orders/`.
8. **Tests:** a `<name>.test.ts(x)` next to every file from steps 1–7, keeping coverage at 100% (`npm run test:coverage`). Service tests run against a real SQLite file in a temp directory, and page tests mock `@cpg/core`. Add an integration test in `tests/integration/` for each new page or flow.

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
        production-orders/{page.tsx,actions.ts}
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
# Every source file has its unit test next to it: <name>.test.ts (Node) or <name>.test.tsx (jsdom)
tests/
  *.test.ts                                      # repo-wide checks (e.g. .ai/ file names)
  integration/                                   # Testcontainers + agent-browser, against the production image
```

---

## 4. How it is enforced

- `eslint.config.mjs` enforces the package layering, the ban on relative imports across packages and `@mikro-orm/*` outside `db`, `no-explicit-any` and `no-console` (except `info`/`warn`/`error`).
- `vitest.config.mts` sets 100% coverage thresholds (lines, branches, functions, statements) over `packages/*/src` and `packages/*/scripts`, so `npm run test:coverage` fails on any uncovered code.
- `.github/workflows/ci.yml` runs lint, typecheck, unit tests with coverage, build and integration tests on every pull request, and `deploy.yml` runs the same workflow before deploying.
- `AGENTS.md` makes reading this document part of the workflow, and its verification step runs lint, typecheck, tests with coverage, build, the touched integration files and `npm audit` triage, then checks the pull request's CI run (which runs the full integration suite).
- Review uses the checklist in Section 1.

## 5. Adoption status (2026-10-17)

Done when these standards were adopted:

- `Setting` moved to `db/src/entities/settings/setting.entity.ts` (table name unchanged, so no migration).
- The first service, `SystemStatusService` (`core/src/services/system/`), is registered in `core/src/container/container.ts`. `/admin` and `/up` read through it instead of querying the ORM. It is the reference for service placement and registration.
- ESLint boundaries added.
- Authentication (2026-10-19, admin sign-in): `core/src/http/{errors,result,server-action}.ts`, `core/src/validators/` with `zod`, and `AuthService`/`LoginThrottle` (`core/src/services/auth/`), with `User` and `Session` in the cross-cutting `auth` entity folder (like `system`). They are the reference for the shared server layer.
- Language, theme, footer and help (2026-10-19, E01-S04): the `UserPreference` entity and `UserPreferenceService` (`preferences` concept), `app/src/i18n/`, `app/src/preferences/` and `app/src/help/`. They are the reference for translated screens.
- Tenants (2026-10-19, spec `2026-10-19--0913UTC-test-prod-tenants`):
  - `core/src/http/api-handler.ts` (each `AppError` carries its HTTP `status`) and `tenant-server-action.ts`;
  - `core/src/container/tenant-scope.ts`;
  - the first route handlers, `app/api/tenants/`, authenticated by `app/src/auth/require-api-user.ts`;
  - the tenant enforcement in `db` (`tenantOwned`, `TenantGuard`, `TenantEntityManager`).
- Users (2026-10-19, user management): `core/src/http/auth.ts`, `UserService` (`core/src/services/users/`), and the first client layers: `ui/src/backend/tables/data-table.tsx` (columns, empty state, row actions; pagination, sorting and filtering wait for the first list that needs them), `forms/crud-form.tsx`, `feedback/{error-message,empty-state}.tsx` and `api/result.ts`. `/admin/users` is the reference for a list screen with create and row actions.
- Audit (2026-10-19, spec `2026-10-19--1050UTC-audit-log`):
  - `GlobalAuditEvent` and `TenantAuditEvent` (`db/src/entities/audit/`), with append-only triggers declared on the entities;
  - `core/src/services/audit/` (`AuditActor`/`uiActor`, `audit-recorder.ts`, `AuditService` with keyset paging);
  - `core/src/http/parse-input.ts` (`parseInput` for query strings and route parameters, shared with `serverAction`);
  - `/admin/audit` and `/admin/[tenant]/audit` (`app/src/components/audit/`), and `GET /api/audit` and `GET /api/tenants/{tenant}/audit`.

  `UserService` and `UserPreferenceService` are the first producers, then `ApiTokenService` (token create and revoke, with `apiActor`/`callerActor` naming the token behind an API call).

  History filters (E13-S03, spec `2026-10-21--0944UTC-audit-history-filters`):
  - both lists take the same filters (record type and ID, account, channel, UTC days) through `auditListSchema` and `auditWhere`, keeping keyset paging;
  - `AuditService.reversalLinks` reads one page's stock-movement reversal links;
  - `UserService.usernames()` is the names-only read any signed-in account may use;
  - `app/src/components/audit/audit-query.ts` builds history and paging URLs and derives the business date from a snapshot;
  - a refused filter is explained in the form; only a bad page position (`before`, `limit` or a foreign cursor, alone or with a filter error) is a not-found page.

  A new producer's action IDs and subject types need EN/PL labels and a place in `components/audit/subject-types.ts`: `tests/audit-labels.test.ts` scans `core` and fails until they have both.

  A new snapshot field goes in `AUDIT_FIELDS` (`core/src/domain/audit/audit-fields.ts`; a per-line one in `AUDIT_LINE_FIELDS`) and gets EN/PL labels in `audit.fields`. The recorder refuses an unlisted field, so the service's own tests fail until it is listed, and `tests/audit-labels.test.ts` fails until it is named (#145).
- Materials (2026-10-19, spec `2026-10-19--1858UTC-materials`), the first tenant business concept:
  - `Material` and `MaterialConversion` (`db/src/entities/materials/`, tenant-owned), `MaterialService` (`core/src/services/materials/`), and the Test demo seed at startup (`core/src/demo-data.ts`);
  - exact decimals in `core/src/domain/quantities/`, material IDs in `core/src/domain/materials/`;
  - the stale-snapshot retry in `tenantServerAction` (`retryingStaleSnapshot`), and `versionConflict()`/`versionSchema` shared by every versioned record;
  - `ui/src/backend/dialogs/confirm-dialog.tsx`, `CrudForm` select fields (shadcn `native-select`) and initial values, and `app/src/routing/or-not-found.ts`;
  - `/admin/[tenant]/materials` and `/admin/[tenant]/materials/[id]` (the reference for a tenant list and detail screen), and `/api/tenants/{tenant}/materials/…`.
- Locations, customers and suppliers (2026-10-19, spec `2026-10-19--2014UTC-locations-customers-suppliers`):
  - three tenant-owned entities with shared properties (`db/src/entities/named-records/`) and one service each, composed over the `NamedRecords` helper (`core/src/services/named-records/`);
  - sequential business IDs for any kind in `core/src/domain/business-ids/sequential-id.ts`, which material IDs now use too;
  - `app/src/components/named-records/` (table with row actions, create dialog, the shared screen), the reference for a small master with no detail page.
- Planning parameters and safety stock (2026-10-20, spec `2026-10-20--0532UTC-planning-parameters-safety-stock`), the first records that reference other masters:
  - leaf lookup modules for references across concepts: `services/materials/find-material.ts`, `services/locations/find-location.ts` and `services/named-records/find-named-record.ts` (`findActive…` refuses an inactive record for new entries). A service that references another concept's record imports these, never the other service. The reverse questions (is a material made somewhere? is its base unit in use?) are leaf modules too: `services/planning-parameters/planning-parameter-usage.ts` and `services/safety-stock/safety-stock-target-usage.ts`;
  - shared field schemas `validators/quantities/quantity.schema.ts` (six-decimal strings, JSON numbers refused) and `validators/dates/calendar-date.schema.ts`;
  - `CrudForm` date fields, `TALL_DIALOG` (`app/src/components/forms/form-labels.ts`) for dialogs that scroll, and the active-only pickers in `app/src/components/master-data/references.tsx`.
- BOMs (2026-10-20, spec `2026-10-20--0757UTC-boms`):
  - `Bom`, `BomRevision` and `BomComponent` (`db/src/entities/boms/`, tenant-owned), with update-abort triggers that make revisions and their lines immutable (`noUpdateTriggers`);
  - `BomService` (`core/src/services/boms/`), the pure recipe rules in `core/src/domain/boms/` (equality, priority overlap, cycle search), and the leaf files `services/materials/base-quantity.ts` (`convertToBaseQuantity`, shared by every stored entered quantity) and `services/boms/bom-usage.ts`;
  - field errors keyed by their full path (`components.2.unit`) in `validationError`, so a list item's error reaches its row;
  - the first form outside `CrudForm`, `components/boms/recipe-form.tsx`: a variable list of lines whose unit choices follow each line's material. It keeps `CrudForm`'s conventions; promote it to `ui/backend/` when order lines (slice 2) need the same;
  - `/admin/[tenant]/boms` and `/admin/[tenant]/boms/[id]` (`?revision=N` for history), and `/api/tenants/{tenant}/boms/…`.
- Master-data and BOM import (2026-10-20, spec `2026-10-20--0908UTC-master-data-bom-import`), the first operation across every master:
  - `inRequestSavepoint` (`core/src/http/request-transaction.ts`): a savepoint on the request's own `em`, under which services' `transactional()` nest, kept or rolled back as a whole. Use it, never `em.transactional()` on the request `em`, to undo a run of service calls without ending the request's transaction;
  - `ImportService` (`core/src/services/imports/`) runs rows through the masters' own services, one per row, clearing the identity map after every row so a long run stays linear; the pure workbook passes and layout are in `core/src/domain/imports/`;
  - the only spreadsheet code is `app/src/components/imports/workbook-file.ts` (`read-excel-file`, `write-excel-file`, and `fflate` counting what it inflates), so `core` sees plain cells;
  - `/admin/[tenant]/import`, `GET /api/import/template` and `POST /api/tenants/{tenant}/import/{dry-run,commit}`. The workbook layout (`domain/imports/workbook-layout.ts`) is a protected contract.
- Stock import (2026-10-20, spec `2026-10-20--2225UTC-stock-import`), the import engine's second workbook:
  - the database-free passes (layout check, cells, duplicate keys) live in `core/src/domain/imports/read-sheets.ts` and read a workbook against an `ImportLayout`. The master-data layout (`MASTER_DATA_LAYOUT`) and the stock layout (`domain/imports/stock-layout.ts`) are two layouts; a new kind of import adds a layout and its own prepare and service, not a second engine;
  - `StockImportService` (`core/src/services/imports/`) only reads in its dry run, and its commit posts every movement as one posting through `postStockMovements`, flushed in chunks (`firstPosition` keeps the positions of one posting unique across calls);
  - `ImportScreen` runs either import (`kind`), `templateWorkbook(layout)` writes either template, and `/admin/[tenant]/stock-import` with `GET /api/stock-import/template` and `POST /api/tenants/{tenant}/stock-import/{dry-run,commit}` serve both roles.
- Goods receipts (2026-10-20, spec `2026-10-20--1933UTC-goods-receipts`), the first document that posts stock. It is the reference for "post a movement group and update the source document", which goods issues, completions and transfers reuse:
  - the ledger's posting primitive is the leaf `postStockMovements(em, …)` in `services/stock/stock-posting.ts`. A document's service calls it on its own transaction's `em`, then writes its own rows and audit in that transaction; it never calls `StockService`, whose `post()` would open a second transaction;
  - the movement's `postingId` is the document's UUID (generated before the posting), `type` names the document kind, and `reason` names its business ID;
  - lookups both services need live in a leaf records module (`services/purchase-orders/order-records.ts`), as `requisition-records.ts` does for requisitions;
  - `GoodsReceiptService` (`core/src/services/goods-receipts/`), `GoodsReceipt`/`GoodsReceiptLine` (immutable through update-abort triggers), `/api/tenants/{tenant}/goods-receipts/…`, and the Post goods receipt dialog on the purchase order's page (`app/src/components/goods-receipts/`).
- Transfers (2026-10-20, spec `2026-10-20--2046UTC-transfers`), the first stock that belongs to no location:
  - in-transit stock is the transfer's progress (`dispatched − received − writtenOff`, derived in `domain/transfers/transfer-quantity.ts`), never a location's balance, so no physical posting can reach it. Each dispatch, receipt and write-off is an immutable `TransferPosting`, the transit leg; the physical leg is an ordinary movement through `postStockMovements`, whose `postingId` is the posting's `id`. A write-off has no physical leg;
  - `services/transfers/transfer-usage.ts` is the leaf the masters (deactivation, base unit) and the stock page (transit from/to a pair) ask, as `stock-usage.ts` is for stock;
  - `TransferService`, `/api/tenants/{tenant}/transfers/…`, `/admin/[tenant]/transfers` and `/admin/[tenant]/transfers/[id]` (`app/src/components/transfers/`: the create form, `CrudForm` posting and dates dialogs, the ledger of legs).
  - To prove a posting's legs roll back together, fail it after the physical leg's flush: a spy on `em` doesn't see the transaction's fork, so the service test mocks `recordTenantAudit` to throw for the posting's action.
- Shipments and goods issues (2026-10-20, spec `2026-10-20--2045UTC-shipments-goods-issues`), the second document that posts stock and the first that lowers it:
  - `GoodsIssueService` posts negative movements through `postStockMovements`, as receipts post positive ones. The ledger's own check refuses an overdraw with `INSUFFICIENT_STOCK`.
  - `ShipmentService` plans dispatches and moves no stock.
  - The leaves `services/customer-orders/order-records.ts`, `services/shipments/shipment-records.ts` and `services/shipments/shipment-usage.ts` hold what several services need. The last one completes finished shipments, after a goods issue or an order edit.
  - The quantity-per-line form of every document posted against another is `components/forms/line-quantities-form.tsx`, used by goods receipts, shipments and goods issues.
  - Both lists page by 100 (`?page=`) from their first release, grouping lines once per page (`groupBy` in `shipment-records.ts`).
  - The shipment page is `/admin/[tenant]/shipments/[id]`. The API is `/api/tenants/{tenant}/shipments/…` and `/goods-issues/…`.
  - Shipment edit and cancel (2026-10-23, spec `2026-10-23--2006UTC-shipment-edit-cancel`, #147):
    - `Shipment` has a `version`. `touchShipment` (`shipment-usage.ts`) moves its `updatedAt` when a write changes only lines, so the version advances.
    - A removed line's row is deleted, and `nextLine` keeps its number from being reused.
    - `completeFinishedShipments` reads with `refresh: true`, so a writer flushes its own header changes first, or touches the shipment after it.
    - `LineQuantitiesForm` takes per-row `initial` values, which is how the edit dialog reuses the create form.
    - The migration widens `shipment.status`'s `CHECK` in place: add, copy, drop, rename (`BACKWARD_COMPATIBILITY.md` §1, named exception).
- The current stock report (2026-10-20, spec `2026-10-20--2221UTC-stock-report`), the first report:
  - `StockReportService` (`core/src/services/reports/`) is a read-only service with no entity of its own, like `system`. It reads balances and Open transfers in bounded batches without the identity map, and the pure `domain/reports/stock-report-rows.ts` merges, filters and pages the rows.
  - `services/stock/movement-sources.ts` is the leaf that resolves a page of movements' `postingId`s to their documents, with one query per document kind.
  - `app/src/components/layout/page-links.tsx` (`PageLinks`) renders the Previous/Next links of a paged table and keeps its query. New paged lists use it; the older lists still render theirs inline.
  - The shadcn `checkbox` submits with a plain `GET` form, which is how the report's zero toggle works.
- The production variance report (2026-10-21, spec `2026-10-21--0947UTC-production-variance-report`), the second report:
  - `VarianceReportService` (`core/src/services/reports/`) sums the completion lines each completion stored, never recomputing them from the recipe. It reads completions and lines in bounded keyset batches without the identity map, and the pure `OrderTally` (`domain/reports/variance-report-rows.ts`) adds the lines as they arrive.
  - Whether a completion is reversed is answered in one place, `reversedCompletions`, from `StockReversal` links on the completion's movements.
  - A report query whose fields pass but whose cross-field check fails (`from` after `to`) keeps the page's form with the error beside the field instead of the not-found state: split the schema into its fields and the refined query.
- Idempotency and versions (2026-10-19, spec `2026-10-19--1548UTC-api-idempotency`): the global and tenant-owned idempotency key stores (`db/src/entities/idempotency/`), `IdempotencyService` (`core/src/services/idempotency/`), `inRequestTransaction`, `apiWrite`/`tenantApiWrite`, `User.version`, and the generation check in `tenantServerAction`.
- API tokens (2026-10-19, spec `2026-10-19--1053UTC-api-tokens`): the global `ApiToken` entity, `ApiTokenService` (`core/src/services/api-tokens/`), bearer authentication in `requireApiUser(request)`, the `Actor` type, and `/admin/tokens`. It is the reference for a self-service screen (every account, own records only).
- Test infrastructure: Vitest unit tests next to every source file at 100% coverage, integration tests (Testcontainers runs the production image, agent-browser drives it), and a CI workflow for pull requests.
- Layering switched to DevMentor's `app → core → db` (the first version of this document kept CPG's original `db → core`). Config and DI moved fully into `core`, the composition root moved from `app/src/server/container.ts` into `core`, and the migration CLI entry point moved to `core/scripts/`. `db` now has no workspace dependencies.

Deliberately **not built yet** (YAGNI). Each arrives with the first concept that needs it, and that concept's change is the reference implementation:

- `core/src/http/make-crud-route.ts`
- `core/src/events/*`
- a shared logger

Known `npm audit` state (2026-10-24, #202): clean, no advisories. Advisories reach this project through code the app never runs: the `shadcn` CLI (`@cpg/ui` keeps it for `npx shadcn add`) brings `@modelcontextprotocol/sdk` → `express` → `body-parser` and three copies of `ajv` → `fast-uri`; `awilix` (through `loadModules`, which this project never calls), `shadcn` and `@next/eslint-plugin-next` bring `fast-glob` → `micromatch` → `braces`. None of `shadcn`, `express`, `body-parser`, `ajv`, `fast-uri`, `fast-glob` or `braces` is in the traced standalone runtime (`packages/app/.next/standalone/node_modules`, which the image copies). History: the 10 `braces` findings (GHSA-vfj7-8cjw-p6xm) were withdrawn by GitHub on 2026-10-23; `body-parser` 2.3.0 (GHSA-27r3-jxmh-p828) and `fast-uri` 3.1.8 (GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp) were moved to 2.4.0 and 3.1.9 the day after, and `tests/lockfile-advisories.test.ts` keeps every copy at or above those floors. To fix the next one, run `npm update <package>` for the flagged package only and check the lockfile diff: `npm audit fix` also prunes unrelated optional entries, and `npm audit fix --force` once offered to downgrade `awilix` to 6.0.0.

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
| `npm audit` as a gate | `npm audit` triage | Advisories arrive through packages outside the traced runtime (the `shadcn` CLI, `awilix`'s unused `loadModules` path, `eslint-config-next`) and can lack a patched release for weeks, so a hard gate would block deploys on code that never ships. Triage fixes what has a patch and records the rest in the "Known `npm audit` state" paragraph above. |
| `docs/product-scope.md` "no DI container" fix | Not applicable | CPG has no such document. Awilix is already a stack decision in `AGENTS.md`. |

### Atomic Test reset (2026-10-20, issue #93)

`TestResetService` (`core/src/services/tenants/`) owns direct-call transactions and joins the keyed API transaction through `inRequestSavepoint`. Since #126 it seeds through the timeline seeder `seedTestTenantDataset` (`services/demo/seed-demo-data.ts`), inside the reset's savepoint, so a failed seed rolls the whole reset back. `resetTestData` in db derives every owned table from ORM metadata, rejects global references and defers (never disables) foreign-key checks until commit. `testResetApiWrite` is a fixed-Test, admin-only mode of the shared keyed pipeline; its receipt is saved in the new generation. Ordinary tenant writes keep their read-only gate and check the generation before replay. Preview tokens read generation fresh inside their transaction, because scope metadata can predate a reset.

### Manual production orders (2026-10-20, issue #88)

`ProductionOrderService` stores the selected immutable revision, entered conversion and lead time; date edits retain those captured values. Options are an authenticated GET read. The first client API consumer adds `ui/src/backend/api/api-call.ts`, preserving public error parameters and field errors while refusing malformed envelopes. Tenant server actions remain writes through `tenantServerAction`. Master deactivation errors can render a linked document through shared form/dialog error formatting.

Both production pages use `ui/src/backend/feedback/loading-message.tsx`: a visible, language-neutral skeleton for their request-time Suspense boundary. Existing blank fallbacks can adopt this shared renderer when their routes change.

### Generated Test dataset (2026-10-21, issue #126)

Test's demonstration data is generated, not listed. The reference for seeding a tenant is in three parts:

- **The generator** is pure code in `core/src/domain/demo/`. `test-tenant-config.json`, validated by its Zod schema with cross-checks, states the shape; `generateTestTenantDataset(config, today)` returns the masters, the forecasts and a dated timeline of documents and postings; `replay.ts` refuses a dataset that would drive a balance negative or exceed its limits. `test-datasets.ts` derives the two datasets from it, tiny (two months of history: the startup seed, a default reset, the tests) and realistic (the committed two years, on the admin's request); they are the container's `testDatasets`, so a test that needs other numbers registers its own instead of mocking a module.
- **The seed context.** `PostingContext`'s `seed` kind carries `at: Date`. Each document service shares one internal path between its public method, which uses `{ kind: "user", actor }` (dated today and audited, INV-010/011), and `seedDemo(input, at)`, which uses `{ kind: "seed", at }` (dated `at`, no audit). `tests/seed-context-callers.test.ts` keeps `kind: "seed"` and `.seedDemo(` out of every page, action and route.
- **The seeder.** `seedTestTenantDataset` writes the timeline through those paths and clears the identity map after every document. Startup (`core/src/demo-data.ts`) runs it in one transaction on an untouched Test (no material, no tenant audit); the reset runs it in its savepoint.

better-sqlite3 runs every statement synchronously, so a loop of service calls inside one transaction never yields to the event loop: during the ~10 s reset, the server answers no other request, and everything queued completes afterwards (measured in the run folder `2026-10-21--1237UTC-test-tenant-dataset/timings.md`). Keep any new bulk operation inside a budget like this one, and measure it.
