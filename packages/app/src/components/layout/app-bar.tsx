import { connection } from "next/server";
import { currentUser } from "../../auth/require-admin";
import { currentPreferences } from "../../preferences/current-preferences";
import { DocumentPreferences } from "../preferences/document-preferences";

/** The request-time slot every page shares, rendered by the root layout inside `<Suspense>`. */
export async function AppBar() {
  await connection();
  const [user, { locale, theme }] = await Promise.all([currentUser(), currentPreferences()]);
  return <DocumentPreferences locale={locale} theme={theme} isSignedIn={user !== null} />;
}
