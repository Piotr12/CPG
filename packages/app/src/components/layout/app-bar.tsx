import Link from "next/link";
import { connection } from "next/server";
import { currentUser } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import { currentPreferences } from "../../preferences/current-preferences";
import { DocumentPreferences } from "../preferences/document-preferences";

/** Reserves the bar's height while it streams in, so the page below doesn't jump. */
export function AppBarPlaceholder() {
  return <div aria-hidden className="h-9" />;
}

/**
 * The request-time strip every page shares, rendered by the root layout inside `<Suspense>`: the Help
 * link in the reader's language, and the document-level language and theme.
 */
export async function AppBar() {
  await connection();
  const [user, { locale, theme }, { messages }] = await Promise.all([currentUser(), currentPreferences(), getMessages()]);

  return (
    <nav lang={locale} className="flex h-9 items-end justify-end px-6 text-sm">
      <DocumentPreferences locale={locale} theme={theme} isSignedIn={user !== null} />
      <Link href="/help" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {messages.nav.help}
      </Link>
    </nav>
  );
}
