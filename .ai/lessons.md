# Lessons learned

Long-term memory for AI agents working on this project. **Read this before starting any task.**

Add an entry after fixing a bug, hitting a non-obvious pitfall, or discovering anything worth remembering. Update or delete entries that turn out to be wrong. One bullet per lesson, grouped by topic:

```markdown
- **YYYY-MM-DD — <short title>** — <what happened / what to do instead>. [details](lessons/YYYY-MM-DD--HHMMUTC-slug.md)
```

The `[details]` link is optional — add a file in [`lessons/`](lessons/) only when the lesson needs a longer write-up.

## General

- **2026-10-17 — Docker `npm ci` tries to compile better-sqlite3** — npm runs `node-gyp rebuild` because the package has a `binding.gyp`, which fails without Python/a compiler. better-sqlite3 ships prebuilt binaries (musl included), so the Dockerfile uses `npm ci --ignore-scripts`.
- **2026-10-17 — Root-level tests are `.mts` run by `node --test`** — the root `package.json` has no `"type"`, so a `.ts` test triggers `MODULE_TYPELESS_PACKAGE_JSON`; `.mts` doesn't, and Node 24 strips the types itself. Put them in `tests/` (picked up by `npm test`, which CI runs before deploying).
- **2026-10-17 — shadcn v4 imports `cn` from the `cn` npm package** — `import { cn } from "cn"` in generated components is correct, not a broken alias. The `new-york` style is legacy; this repo uses `radix-nova`.

## Next.js

- **2026-10-17 — One ORM per bundle, keyed by entity identity** — Next.js gives route handlers, pages and instrumentation separate copies of `@cpg/db`, and MikroORM matches entities by object identity. Never cache the container/ORM on `globalThis` under a string key; `getContainer()` keys it by the `entities` array. [details](lessons/2026-10-17--0920UTC-mikroorm-entity-identity-next-bundles.md)
- **2026-10-17 — Dynamic `fs` paths make Turbopack trace the whole project** — paths built from env/`process.cwd()` pull every source file into the standalone output. Mark them with `/* turbopackIgnore: true */` (see `packages/core/src/config.ts`).
