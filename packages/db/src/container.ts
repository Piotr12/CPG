import type { AppContainer } from "@cpg/core";
import type { EntityManager } from "@mikro-orm/sqlite";
import { asClass, asFunction, asValue } from "awilix";
import type { Orm } from "./orm";
import { SystemStatusService } from "./services/system/system-status.service";

declare module "@cpg/core" {
  interface Cradle {
    orm: Orm;
    /** A fresh EntityManager fork per container scope (i.e. per request). */
    em: EntityManager;
    systemStatusService: SystemStatusService;
  }
}

/** Registers the ORM and every service of `@cpg/db` — one explicit line each, no auto-discovery. */
export function registerDb(container: AppContainer, orm: Orm): void {
  container.register({
    orm: asValue(orm),
    em: asFunction(({ orm }: { orm: Orm }) => orm.em.fork()).scoped(),
    systemStatusService: asClass(SystemStatusService).scoped(),
  });
}
