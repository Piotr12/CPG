import { API_TOKEN_NAME_MAX, ApiToken } from "./api-tokens/api-token.entity";
import { Session } from "./auth/session.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { LOCALES, THEMES, UserPreference, type Locale, type Theme } from "./preferences/user-preference.entity";
import { Setting } from "./settings/setting.entity";
import { Tenant, TENANT_CODES, type TenantCode } from "./tenants/tenant.entity";
import {
  currentTenant,
  isTenantOwned,
  TENANT_FILTER,
  tenantOwned,
  TenantViolationError,
  selectTenant,
} from "./tenants/tenant-owned";

export { API_TOKEN_NAME_MAX, ApiToken, LOCALES, Session, Setting, Tenant, TENANT_CODES, THEMES, User, USER_ROLES, UserPreference };
export type { Locale, TenantCode, Theme, UserRole };
export { currentTenant, isTenantOwned, TENANT_FILTER, tenantOwned, TenantViolationError, selectTenant };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session, UserPreference, Tenant, ApiToken];

/**
 * Entities that belong to no tenant: accounts, sessions, API tokens, preferences, settings and the
 * tenants themselves. Every other entity must be declared with `tenantOwned()` (enforced by
 * tests/tenant-ownership.test.ts).
 */
export const GLOBAL_ENTITIES = [Setting, User, Session, UserPreference, Tenant, ApiToken];
