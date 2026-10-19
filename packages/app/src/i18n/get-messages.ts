import type { Locale } from "@cpg/core";
import { currentPreferences } from "../preferences/current-preferences";
import { en, type Messages } from "./messages/en";
import { pl } from "./messages/pl";

export const MESSAGES: Record<Locale, Messages> = { en, pl };

/** The dictionary for this request's account. Call it only inside a request-time `<Suspense>` child. */
export async function getMessages(): Promise<{ locale: Locale; messages: Messages }> {
  const { locale } = await currentPreferences();
  return { locale, messages: MESSAGES[locale] };
}
