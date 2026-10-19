import { connection } from "next/server";
import { TENANT_CODES, TENANT_NAMES, type TenantCode } from "@cpg/core";
import { currentUser } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import type { Messages } from "../../i18n/messages/en";
import { currentPreferences } from "../../preferences/current-preferences";
import { DocumentPreferences } from "../preferences/document-preferences";
import { AccountPanel } from "./account-panel";
import { navModel } from "./nav-items";
import { SidebarNav, type SidebarLabels } from "./sidebar-nav";
import { VisitorBar } from "./visitor-bar";

/**
 * Reserves the sidebar's column from `md`, and the top bar's height below it, while the sidebar
 * streams in, so a signed-in page doesn't jump. Text-free: the language isn't known yet.
 */
export function SidebarSkeleton() {
  return <div aria-hidden className="h-12 shrink-0 border-b bg-sidebar md:h-auto md:w-(--sidebar-width) md:border-r md:border-b-0" />;
}

const perTenant = (text: (name: string) => string) =>
  Object.fromEntries(TENANT_CODES.map((code) => [code, text(TENANT_NAMES[code])])) as Record<TenantCode, string>;

/** The sidebar's strings in the reader's language; client components get their strings as props. */
function sidebarLabels({ nav, tenants }: Messages): SidebarLabels {
  return {
    menu: nav.menu,
    close: nav.close,
    account: nav.account,
    collapse: nav.collapse,
    expand: nav.expand,
    sidebar: nav.sidebar,
    sidebarDescription: nav.sidebarDescription,
    shared: nav.shared,
    sharedNote: nav.sharedNote,
    tenantNames: TENANT_NAMES,
    tenantSwitch: perTenant(nav.tenantSwitch),
    menuShows: perTenant(nav.menuShows),
    captions: tenants.description,
  };
}

/**
 * The request-time navigation every page shares, rendered by the root layout inside `<Suspense>`:
 * the sidebar for a signed-in account, the visitor bar otherwise, and the document-level language
 * and theme. What the account may see is decided here; `SidebarNav` only lays it out.
 */
export async function AppSidebar() {
  await connection();
  const [user, { locale, theme }, { messages }] = await Promise.all([currentUser(), currentPreferences(), getMessages()]);
  const preferences = <DocumentPreferences locale={locale} theme={theme} isSignedIn={user !== null} />;

  if (!user) {
    return (
      <>
        {preferences}
        <VisitorBar locale={locale} labels={{ menu: messages.nav.menu, help: messages.nav.help, signIn: messages.nav.signIn }} />
      </>
    );
  }

  return (
    <>
      {preferences}
      <SidebarNav
        model={navModel(user, messages.nav)}
        labels={sidebarLabels(messages)}
        account={{
          name: user.username,
          role: messages.nav.roles[user.role],
          panel: <AccountPanel username={user.username} locale={locale} theme={theme} messages={messages} />,
        }}
        locale={locale}
      />
    </>
  );
}
