# MikroORM entities break when an ORM is shared across Next.js bundles

**Symptom:** `/admin` failed with `TypeError: Cannot read properties of undefined (reading 'filter')` in production, while `/up` worked.

**Root cause:** Next.js (Turbopack) bundles route handlers, pages and `instrumentation.ts` separately, and each bundle gets its own copy of workspace packages like `@cpg/db`. The DI container was cached on `globalThis` under a string key, so whichever bundle created it first owned the ORM. MikroORM looks entity metadata up **by object identity** (`MetadataStorage.find`), so `em.count(Setting)` with another bundle's `Setting` schema fell back to that schema's uninitialised metadata.

**Fix:** `getContainer()` keys the singleton by the `entities` array imported from `@cpg/db`, giving every bundle copy its own container and ORM built from the same entity objects it queries with. Startup migrations use a short-lived ORM (`migrate()`) instead of creating the shared container.

**Rule:** never share stateful objects that depend on module identity (ORM, entity classes, `instanceof` checks) between bundles via a string-keyed global. Key them by an object from the module they depend on.
