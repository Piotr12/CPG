"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requestScope, serverAction, UnauthorizedError } from "@cpg/core";
import { userPreferenceUpdateSchema } from "@cpg/core/validators/preferences/user-preference-update.schema";
import { currentUser, SIGN_IN_PATH } from "../../auth/require-admin";
import { clearSessionCookie, readSessionToken } from "../../auth/session-cookie";
import type { PreferencesState } from "../../components/preferences/preferences-controls";
import { errorMessage } from "../../i18n/error-message";
import { getMessages } from "../../i18n/get-messages";
import { clearThemeCookie, writeThemeCookie } from "../../preferences/theme-cookie";

/** Ends the current session (if any), drops the cookies and goes back to sign-in. */
export async function signOut(): Promise<void> {
  const { authService } = (await requestScope()).cradle;
  await authService.signOut(await readSessionToken());
  await clearSessionCookie();
  await clearThemeCookie();
  redirect(SIGN_IN_PATH);
}

/**
 * The language/theme switches' action. Always changes the caller's own account; the payload can't
 * name another one. On success the theme cookie follows and the page re-renders in place.
 */
export async function updatePreferences(_previous: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const { userPreferenceService, config } = (await requestScope()).cradle;
  const save = serverAction(userPreferenceUpdateSchema, async (change) => {
    const user = await currentUser();
    if (!user) throw new UnauthorizedError();
    return userPreferenceService.update(user.userId, change);
  });
  const result = await save({ locale: formData.get("locale") ?? undefined, theme: formData.get("theme") ?? undefined });

  if (!result.ok) {
    if (result.error.code === "UNAUTHORIZED") redirect(SIGN_IN_PATH);
    return { error: errorMessage((await getMessages()).messages.errors, result.error) };
  }

  await writeThemeCookie(result.data.theme, { secure: config.env === "production" });
  refresh();
  return {};
}
