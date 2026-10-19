import { Session } from "./auth/session.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { Setting } from "./settings/setting.entity";
import { Tenant, TENANT_CODES, type TenantCode } from "./tenants/tenant.entity";

export { Session, Setting, Tenant, TENANT_CODES, User, USER_ROLES, type TenantCode, type UserRole };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session, Tenant];
