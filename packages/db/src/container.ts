import type { AppContainer } from "@cpg/core";
import type { EntityManager } from "@mikro-orm/sqlite";
import { asFunction, asValue } from "awilix";
import type { Orm } from "./orm";

declare module "@cpg/core" {
  interface Cradle {
    orm: Orm;
    /** A fresh EntityManager fork per container scope (i.e. per request). */
    em: EntityManager;
  }
}

export function registerDb(container: AppContainer, orm: Orm): void {
  container.register({
    orm: asValue(orm),
    em: asFunction(({ orm }: { orm: Orm }) => orm.em.fork()).scoped(),
  });
}
