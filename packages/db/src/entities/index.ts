import { Session } from "./auth/session.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { LOCALES, THEMES, UserPreference, type Locale, type Theme } from "./preferences/user-preference.entity";
import { Setting } from "./settings/setting.entity";

export { LOCALES, Session, Setting, THEMES, User, USER_ROLES, UserPreference, type Locale, type Theme, type UserRole };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [Setting, User, Session, UserPreference];
