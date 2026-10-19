import { TENANT_NAMES, type SessionUser, type TenantCode } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";

/** The screens the menu can offer. Test and Prod are the tenant homes. */
export type NavItemId = "tenants" | TenantCode | "audit" | "tokens" | "users" | "help" | "signIn";

export interface NavItem {
  id: NavItemId;
  href: string;
}

/** Where every signed-in account may go: the tenant chooser, both tenant homes, the Global audit and its own tokens. */
const ACCOUNT_ITEMS: NavItem[] = [
  { id: "tenants", href: "/admin" },
  { id: "test", href: "/admin/test" },
  { id: "prod", href: "/admin/prod" },
  { id: "audit", href: "/admin/audit" },
  { id: "tokens", href: "/admin/tokens" },
];
const ADMIN_ITEMS: NavItem[] = [{ id: "users", href: "/admin/users" }];
const HELP: NavItem = { id: "help", href: "/help" };
const SIGN_IN: NavItem = { id: "signIn", href: "/login" };

/**
 * The menu's entries for this account, in order: what it can open, then Help; signed out, Help and
 * Sign in. Hiding an entry is cosmetic: every page still gates itself with requireUser()/requireAdmin().
 */
export function navItems(user: Pick<SessionUser, "role"> | null): NavItem[] {
  if (!user) return [HELP, SIGN_IN];
  return [...ACCOUNT_ITEMS, ...(user.role === "admin" ? ADMIN_ITEMS : []), HELP];
}

/** An entry's label in the reader's language; the tenants keep their names, as the tenant strip does. */
export function navLabel(id: NavItemId, nav: Messages["nav"]): string {
  return id === "test" || id === "prod" ? TENANT_NAMES[id] : nav[id];
}
