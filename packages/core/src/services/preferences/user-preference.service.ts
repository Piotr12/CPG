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
   * the unique account column that, on conflict, overwrites only the fields this change names: a
   * double-click can't create a second row, and a language change and a theme change racing from two
   * tabs can't undo each other.
   */
  async update(userId: string, change: UserPreferenceUpdate): Promise<Preferences> {
    const changed = definedFields(change);
    const mergeFields = [...(Object.keys(changed) as (keyof Preferences)[]), "updatedAt" as const];
    await this.em.upsert(
      UserPreference,
      { user: userId, ...DEFAULT_PREFERENCES, ...changed, updatedAt: new Date() },
      { onConflictFields: ["user"], onConflictMergeFields: mergeFields },
    );
    const row = await this.em.findOneOrFail(UserPreference, { user: userId }, { refresh: true });
    return { locale: row.locale, theme: row.theme };
  }
}

/** Drops `undefined` fields so a partial change never overwrites a stored value with nothing. */
function definedFields(change: UserPreferenceUpdate): Partial<Preferences> {
  return Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
}
