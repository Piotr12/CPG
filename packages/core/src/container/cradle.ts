import type { EntityManager, Orm } from "@cpg/db";
import type { AwilixContainer } from "awilix";
import type { AppConfig } from "../config";
import type { AuthService } from "../services/auth/auth.service";
import type { LoginThrottle } from "../services/auth/login-throttle";
import type { UserPreferenceService } from "../services/preferences/user-preference.service";
import type { SystemStatusService } from "../services/system/system-status.service";
import type { TenantInfo, TenantService } from "../services/tenants/tenant.service";

/** Everything the DI container can resolve — one entry per registration in `container.ts`. */
export interface Cradle {
  config: AppConfig;
  orm: Orm;
  /** A fresh EntityManager fork per container scope (i.e. per request). */
  em: EntityManager;
  systemStatusService: SystemStatusService;
  loginThrottle: LoginThrottle;
  authService: AuthService;
  userPreferenceService: UserPreferenceService;
  tenantService: TenantService;
  /** The active tenant. Only in scopes built by `tenantScope()`. */
  tenant: TenantInfo;
}

export type AppContainer = AwilixContainer<Cradle>;
