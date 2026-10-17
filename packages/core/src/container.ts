import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { AppConfig } from "./config";

/**
 * Everything the DI container can resolve. Packages add their own registrations with
 * declaration merging, e.g. in `@cpg/db`:
 *
 *   declare module "@cpg/core" { interface Cradle { orm: MikroORM } }
 */
export interface Cradle {
  config: AppConfig;
}

export type AppContainer = AwilixContainer<Cradle>;

/**
 * Creates the root container. PROXY mode resolves dependencies by destructuring the cradle
 * (`({ orm, config }) => ...`), so it keeps working after the production build minifies
 * parameter names — CLASSIC mode would not.
 */
export function createAppContainer(config: AppConfig): AppContainer {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({ config: asValue(config) });
  return container;
}
