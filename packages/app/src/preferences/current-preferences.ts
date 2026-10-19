import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { DEFAULT_PREFERENCES, requestScope, type Preferences } from "@cpg/core";
import { currentUser } from "../auth/require-admin";

/**
 * The signed-in account's language and theme, or the defaults for a visitor. Looked up once per
 * request. A failed lookup logs and falls back to the defaults: a display preference is never a reason
 * to fail a page, and authorization keeps its own fail-closed path in `requireAdmin()`.
 */
export const currentPreferences = cache(async (): Promise<Preferences> => {
  const user = await currentUser();
  if (!user) return { ...DEFAULT_PREFERENCES };
  try {
    const { userPreferenceService } = (await requestScope()).cradle;
    return await userPreferenceService.get(user.userId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Preference lookup failed:", error);
    return { ...DEFAULT_PREFERENCES };
  }
});
