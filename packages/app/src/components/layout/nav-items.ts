import type { SessionUser } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { isGroup, SHARED_TREE, TENANT_TREE, type NavEntry, type NavItem, type NavModel, type NavNode } from "./nav-tree";

/** Keeps what the account may see, at every level, and labels it in the reader's language. */
function visible(tree: NavNode[], isAdmin: boolean, nav: Messages["nav"]): NavItem[] {
  return tree
    .filter((node) => isAdmin || !node.adminOnly)
    .map((node): NavItem =>
      isGroup(node)
        ? { ...node, label: nav[node.id], children: visible(node.children, isAdmin, nav) as NavEntry[] }
        : { ...node, label: nav[node.id] },
    );
}

/**
 * The sidebar for this account, in the reader's language: the tenant zone, then the shared zone;
 * null for a visitor, who gets the visitor bar. Hiding an entry is cosmetic: every page still gates
 * itself with requireUser()/requireAdmin().
 */
export function navModel(user: Pick<SessionUser, "role">, nav: Messages["nav"]): NavModel;
export function navModel(user: Pick<SessionUser, "role"> | null, nav: Messages["nav"]): NavModel | null;
export function navModel(user: Pick<SessionUser, "role"> | null, nav: Messages["nav"]): NavModel | null {
  if (!user) return null;
  const isAdmin = user.role === "admin";
  return { tenant: visible(TENANT_TREE, isAdmin, nav), shared: visible(SHARED_TREE, isAdmin, nav) };
}
