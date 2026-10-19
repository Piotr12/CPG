import { Session } from "./auth/session.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { Setting } from "./settings/setting.entity";
import { Tenant, TENANT_CODES, type TenantCode } from "./tenants/tenant.entity";
import {
  currentTenant,
  isTenantOwned,
  TENANT_FILTER,
  tenantOwned,
  TenantViolationError,
  useTenant,
} from "./tenants/tenant-owned";

export { Session, Setting, Tenant, TENANT_CODES, User, USER_ROLES, type TenantCode, type UserRole };
export { currentTenant, isTenantOwned, TENANT_FILTER, tenantOwned, TenantViolationError, useTenant };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session, Tenant];

/**
 * Entities that belong to no tenant: accounts, sessions, settings and the tenants themselves.
 * Every other entity must be declared with `tenantOwned()` (enforced by tests/tenant-ownership.test.ts).
 */
export const GLOBAL_ENTITIES = [Setting, User, Session, Tenant];
