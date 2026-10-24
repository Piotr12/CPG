"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { Button } from "@cpg/ui/components/button";
import { tenantFromPath } from "../../../components/layout/current-path";
import { isCurrentLeaf, leafHref, type NavEntry } from "../../../components/layout/nav-tree";
import { fill } from "../../../i18n/fill";

/** Plain data only: the server's dictionaries hold functions, which can't reach a client component. */
export interface BackLinkProps {
  /** The tenant's lists, labelled as the sidebar labels them. */
  lists: NavEntry[];
  tenants: Record<TenantCode, string>;
  labels: { backTo: string; backToOverview: string; goToTenants: string };
}

/**
 * The not-found page's way back, read from the address only the client knows: the list the address
 * belongs to (`/admin/test/materials/99999999` → Back to Materials), else the tenant's Overview.
 */
export function BackLink({ lists, tenants, labels }: BackLinkProps) {
  const pathname = usePathname();
  const tenant = tenantFromPath(pathname);
  const list = tenant && lists.find((leaf) => isCurrentLeaf(leaf, tenant, pathname));
  const [href, text] = !tenant
    ? ["/admin", labels.goToTenants]
    : list
      ? [leafHref(list, tenant), fill(labels.backTo, { list: list.label })]
      : [`/admin/${tenant}`, fill(labels.backToOverview, { tenant: tenants[tenant] })];

  return (
    <Button asChild variant="outline">
      <Link href={href}>{text}</Link>
    </Button>
  );
}
