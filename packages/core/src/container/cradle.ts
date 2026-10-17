import type { EntityManager, Orm } from "@cpg/db";
import type { AwilixContainer } from "awilix";
import type { AppConfig } from "../config";
import type { SystemStatusService } from "../services/system/system-status.service";

/** Everything the DI container can resolve — one entry per registration in `container.ts`. */
export interface Cradle {
  config: AppConfig;
  orm: Orm;
  /** A fresh EntityManager fork per container scope (i.e. per request). */
  em: EntityManager;
  systemStatusService: SystemStatusService;
}

export type AppContainer = AwilixContainer<Cradle>;
