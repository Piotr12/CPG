import type { EntityManager, Orm } from "@cpg/db";
import type { AwilixContainer } from "awilix";
import type { AppConfig } from "../config";
import type { ApiTokenService } from "../services/api-tokens/api-token.service";
import type { AuditService } from "../services/audit/audit.service";
import type { AuthService } from "../services/auth/auth.service";
import type { LoginThrottle } from "../services/auth/login-throttle";
import type { IdempotencyService } from "../services/idempotency/idempotency.service";
import type { CustomerService } from "../services/customers/customer.service";
import type { LocationService } from "../services/locations/location.service";
import type { BomService } from "../services/boms/bom.service";
import type { ImportService } from "../services/imports/import.service";
import type { PlanningParameterService } from "../services/planning-parameters/planning-parameter.service";
import type { SafetyStockTargetService } from "../services/safety-stock/safety-stock-target.service";
import type { MaterialService } from "../services/materials/material.service";
import type { SupplierService } from "../services/suppliers/supplier.service";
import type { UserPreferenceService } from "../services/preferences/user-preference.service";
import type { SystemStatusService } from "../services/system/system-status.service";
import type { UserService } from "../services/users/user.service";
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
  userService: UserService;
  userPreferenceService: UserPreferenceService;
  tenantService: TenantService;
  apiTokenService: ApiTokenService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
  materialService: MaterialService;
  locationService: LocationService;
  customerService: CustomerService;
  supplierService: SupplierService;
  planningParameterService: PlanningParameterService;
  safetyStockTargetService: SafetyStockTargetService;
  bomService: BomService;
  importService: ImportService;
  /** The active tenant. Only in scopes built by `tenantScope()`. */
  tenant: TenantInfo;
}

export type AppContainer = AwilixContainer<Cradle>;
