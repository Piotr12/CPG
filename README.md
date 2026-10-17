# 🦣 Caveman Planning Good (CPG)

### MRP II. Because planning hard. Caveman try anyway.

After years in supply chain IT, I concluded the world needs another MRP II system. This conclusion is almost certainly wrong. Here we are anyway.

CPG is deliberately primitive manufacturing planning. No seventeen-layer optimisation engine that needs a consulting firm to explain why nothing works. Just four things:

- **Demand Forecast**: guess what people will want. They will want something else.
- **Bill of Materials**: know what things are made of, ideally before making them.
- **Production Planning**: decide what to make, how much, and when. Preferably before it's needed.
- **Production Execution**: make things. Discover why the plan was wrong.

**Philosophy:** if a reasonably intelligent caveman can't follow the planning logic, the logic is too clever.

**Who builds this?** An LLM writes it while I sit nearby making increasingly skeptical noises, which isn't far from how enterprise software has always been made.

## Architecture

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, Cache Components), React 19, TypeScript |
| Database | SQLite (better-sqlite3) through MikroORM 7, with migrations |
| Dependency injection | Awilix |
| Styling | Tailwind CSS 4 for frontend pages, shadcn/ui for backend (admin) pages |
| Repo layout | npm workspaces monorepo |
| Deployment | Docker + Kamal on a single VM, from GitHub Actions |

```
packages/
├── app/    @cpg/app   Next.js app: routes, pages, DI composition root, startup migrations
├── core/   @cpg/core  reusable bits: config, DI container factory, shared logic
├── db/     @cpg/db    MikroORM config, entities, migrations, DB registrations
└── ui/     @cpg/ui    shadcn/ui components, theme, Tailwind entry CSS
```

Dependencies only point one way: `app → core, db, ui` and `db → core`. Packages ship TypeScript source, so there's no build step per package; Turbopack compiles them as part of the app.

**Request flow.** At startup, `instrumentation.ts` applies any pending migrations. A request resolves what it needs from the Awilix container (`getContainer()` / `requestScope()`), which holds the config, the ORM and a request-scoped `EntityManager`. Packages register their own services and extend the typed `Cradle`.

**Data.** Everything the app persists lives under `DATA_DIR`: the SQLite file (`cpg.sqlite`, WAL mode) and any other files. In production, that's `/externaldata` inside the container, bind-mounted from `/externaldata/cpg.baby` on the VM, so it survives deploys. Locally, it's `./data/`.

**Health.** `/up` queries the database, so kamal-proxy won't switch traffic to a container that can't reach its data.

## Development

```sh
npm install
npm run dev                               # http://localhost:3000, admin at /admin
npm run lint && npm run typecheck && npm run build

npm run db:migration:create -- add-items  # after changing an entity
npm run db:migrate                        # apply migrations (also runs on server start)

cd packages/ui && npx shadcn@latest add dialog   # add a shadcn component
```

## Deployment

Pushing to `main` builds the Docker image and deploys it with Kamal (`config/deploy.yml`, `.github/workflows/deploy.yml`). The VM directory `/externaldata/cpg.baby` must exist and be writable by uid 1001 (the container user).

## For AI agents

Start with [`AGENTS.md`](AGENTS.md). Specs, run logs and lessons learned are in [`.ai/`](.ai/).

---

Demand come. Caveman plan. Caveman make. **Planning good.**
