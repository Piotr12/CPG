import { User, UserPreference, type EntityManager, type Locale, type Theme } from "@cpg/db";
import type { UserPreferenceUpdate } from "../../validators/preferences/user-preference-update.schema";
import type { Actor } from "../audit/actor";
import { recordGlobalAudit } from "../audit/audit-recorder";

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
    return read(this.em, userId);
  }

  /**
   * Applies a parsed change; fields it leaves out keep their stored (or default) value. One upsert on
   * the unique account column that, on conflict, overwrites only the fields this change names: a
   * double-click can't create a second row, and a language change and a theme change racing from two
   * tabs can't undo each other. A real change is recorded in the Global audit, in the same short
   * transaction as the upsert; choosing what is already stored records nothing.
   */
  async update(userId: string, change: UserPreferenceUpdate, actor: Actor): Promise<Preferences> {
    const changed = definedFields(change);
    const mergeFields = [...(Object.keys(changed) as (keyof Preferences)[]), "updatedAt" as const];
    return this.em.transactional(async (em) => {
      const user = await em.findOneOrFail(User, { id: userId });
      const before = await read(em, userId);
      await em.upsert(
        UserPreference,
        { user: userId, ...DEFAULT_PREFERENCES, ...changed, updatedAt: new Date() },
        { onConflictFields: ["user"], onConflictMergeFields: mergeFields },
      );
      const row = await em.findOneOrFail(UserPreference, { user: userId }, { refresh: true });
      const after = { locale: row.locale, theme: row.theme };
      if (before.locale !== after.locale || before.theme !== after.theme) {
        recordGlobalAudit(em, actor, {
          action: "preferences.user-preference.updated",
          subject: { type: "User", id: user.id, label: user.username },
          before: { ...before },
          after: { ...after },
        });
      }
      return after;
    });
  }
}

/** The account's stored choices, or the defaults when it has never chosen. */
async function read(em: EntityManager, userId: string): Promise<Preferences> {
  const row = await em.findOne(UserPreference, { user: userId });
  return row ? { locale: row.locale, theme: row.theme } : { ...DEFAULT_PREFERENCES };
}

/** Drops `undefined` fields so a partial change never overwrites a stored value with nothing. */
function definedFields(change: UserPreferenceUpdate): Partial<Preferences> {
  return Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
}
