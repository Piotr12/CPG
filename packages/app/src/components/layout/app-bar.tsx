import Link from "next/link";
import { connection } from "next/server";
import { currentUser } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import { currentPreferences } from "../../preferences/current-preferences";
import { DocumentPreferences } from "../preferences/document-preferences";
import { AccountPanel } from "./account-panel";
import { NavMenu } from "./nav-menu";
import { navItems, navLabel } from "./nav-items";

const BAR_CLASS = "flex h-12 shrink-0 items-center gap-4 border-b px-4 text-sm md:px-6";

/** Reserves the bar's height while it streams in, so the page below doesn't jump. */
export function AppBarPlaceholder() {
  return <div aria-hidden className={BAR_CLASS} />;
}

/**
 * The request-time bar every page shares, rendered by the root layout inside `<Suspense>`: the home
 * link, the menu of what this account can open, its account controls, and the document-level language
 * and theme. What the account sees is decided here; `NavMenu` only lays it out.
 */
export async function AppBar() {
  await connection();
  const [user, { locale, theme }, { messages }] = await Promise.all([currentUser(), currentPreferences(), getMessages()]);
  const t = messages.nav;
  const items = navItems(user).map(({ id, href }) => ({ id, href, label: navLabel(id, t) }));
  const account = user && {
    name: user.username,
    panel: <AccountPanel username={user.username} locale={locale} theme={theme} messages={messages} />,
    inline: <AccountPanel username={user.username} locale={locale} theme={theme} messages={messages} layout="inline" />,
  };

  return (
    <header lang={locale} className={BAR_CLASS}>
      <DocumentPreferences locale={locale} theme={theme} isSignedIn={user !== null} />
      <Link href="/" className="font-semibold whitespace-nowrap">
        <span aria-hidden>🦣</span> CPG
      </Link>
      <NavMenu items={items} account={account} locale={locale} labels={{ menu: t.menu, close: t.close, account: t.account }} />
    </header>
  );
}
