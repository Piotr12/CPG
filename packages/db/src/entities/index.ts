import { Session } from "./auth/session.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { Setting } from "./settings/setting.entity";

export { Session, Setting, User, USER_ROLES, type UserRole };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session];
