import { UserPreference, type EntityManager, type Locale, type Theme } from "@cpg/db";
import type { UserPreferenceUpdate } from "../../validators/preferences/user-preference-update.schema";

export interface Preferences {
  locale: Locale;
  theme: Theme;
}

/** What an account sees until it chooses: English (UX-001) and the light theme CPG always had. */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({ locale: "en", theme: "light" });

interface Deps {
  em: EntityManager;
}

/** Reads and changes one account's language and theme. The only write path for preferences. */
export class UserPreferenceService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** The account's choices, or the defaults when it has never chosen. */
  async get(userId: string): Promise<Preferences> {
    const row = await this.em.findOne(UserPreference, { user: userId });
    return row ? { locale: row.locale, theme: row.theme } : { ...DEFAULT_PREFERENCES };
  }

  /**
   * Applies a parsed change; fields it leaves out keep their stored (or default) value. One upsert on
   * the unique account column, so a double-click or two tabs can never create a second row.
   */
  async update(userId: string, change: UserPreferenceUpdate): Promise<Preferences> {
    const next = { ...(await this.get(userId)), ...definedFields(change) };
    await this.em.upsert(UserPreference, { user: userId, ...next }, { onConflictFields: ["user"] });
    return next;
  }
}

/** Drops `undefined` fields so a partial change never overwrites a stored value with nothing. */
function definedFields(change: UserPreferenceUpdate): Partial<Preferences> {
  return Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
}
