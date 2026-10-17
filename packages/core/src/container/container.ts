import { entities, initOrm, type Orm } from "@cpg/db";
import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import { loadConfig, type AppConfig } from "../config";
import { toDbOptions } from "../database";
import { SystemStatusService } from "../services/system/system-status.service";
import { globalSingleton } from "../singleton";
import type { AppContainer, Cradle } from "./cradle";

/**
 * The composition root: every dependency is registered here by hand, one line each — no
 * auto-discovery. PROXY mode resolves dependencies by destructuring the cradle
 * (`({ orm, config }) => ...`), so it keeps working after the production build minifies parameter
 * names — CLASSIC mode would not.
 */
export function createAppContainer(config: AppConfig, orm: Orm): AppContainer {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    orm: asValue(orm),
    em: asFunction(({ orm }: { orm: Orm }) => orm.em.fork()).scoped(),
    systemStatusService: asClass(SystemStatusService).scoped(),
  });
  return container;
}

/**
 * The process-wide container. The database is migrated at startup by the app's
 * `instrumentation.ts`. Server-only — never import this from a client component.
 *
 * Keyed by the `entities` array, not a name: Next.js bundles route handlers and pages separately,
 * each with its own copy of `@cpg/core` and `@cpg/db`, and MikroORM matches entities by object
 * identity. So every copy gets its own container (and SQLite connection) built from the entities
 * it will query with.
 */
export function getContainer(): Promise<AppContainer> {
  return globalSingleton(entities, async () => {
    const config = loadConfig();
    return createAppContainer(config, await initOrm(toDbOptions(config)));
  });
}

/** A per-request child scope: scoped registrations (like `em`) get a fresh instance each time. */
export async function requestScope(): Promise<AppContainer> {
  return (await getContainer()).createScope();
}
