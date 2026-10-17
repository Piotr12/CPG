import { createAppContainer, globalSingleton, loadConfig, type AppContainer } from "@cpg/core";
import { entities, initOrm, registerDb } from "@cpg/db";

/**
 * The DI container: config, ORM and everything packages register. The database is migrated at
 * startup by `instrumentation.ts`. Server-only — never import this from a client component.
 *
 * Keyed by the `entities` array, not a name: Next.js bundles route handlers and pages separately,
 * each with its own copy of `@cpg/db`, and MikroORM matches entities by object identity. So every
 * copy gets its own container (and SQLite connection) built from the entities it will query with.
 */
export function getContainer(): Promise<AppContainer> {
  return globalSingleton(entities, async () => {
    const config = loadConfig();
    const container = createAppContainer(config);
    registerDb(container, await initOrm(config));
    return container;
  });
}

/** A per-request child scope: scoped registrations (like `em`) get a fresh instance each time. */
export async function requestScope(): Promise<AppContainer> {
  return (await getContainer()).createScope();
}
