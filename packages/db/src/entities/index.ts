import {
  AUDIT_APPEND_ONLY,
  AUDIT_CHANNELS,
  type AuditChannel,
  type AuditSnapshot,
  type AuditValue,
} from "./audit/audit-event";
import { GlobalAuditEvent } from "./audit/global-audit-event.entity";
import { TenantAuditEvent } from "./audit/tenant-audit-event.entity";
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

export { LOCALES, Session, Setting, Tenant, TENANT_CODES, THEMES, User, USER_ROLES, UserPreference };
export { AUDIT_APPEND_ONLY, AUDIT_CHANNELS, GlobalAuditEvent, TenantAuditEvent };
export type { AuditChannel, AuditSnapshot, AuditValue, Locale, TenantCode, Theme, UserRole };
export { currentTenant, isTenantOwned, TENANT_FILTER, tenantOwned, TenantViolationError, selectTenant };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session, UserPreference, Tenant, GlobalAuditEvent, TenantAuditEvent];

/**
 * Entities that belong to no tenant: accounts, sessions, preferences, settings, the tenants
 * themselves and the Global audit. Every other entity must be declared with `tenantOwned()` (enforced by
 * tests/tenant-ownership.test.ts).
 */
export const GLOBAL_ENTITIES = [Setting, User, Session, UserPreference, Tenant, GlobalAuditEvent];
