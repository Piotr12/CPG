"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@cpg/ui/components/breadcrumb";
import { tenantFromPath } from "../layout/current-path";
import { trailOf, type NavModel } from "../layout/nav-tree";

/**
 * Where the open page sits in the sidebar, after the tenant header's tag: `TEST › Master data ›
 * Materials`. Read from the same tree the sidebar shows, so the two never disagree; nothing when the
 * sidebar doesn't hold the page.
 */
export function SectionTrail({ model, label }: { model: NavModel; label: string }) {
  const pathname = usePathname();
  // Off a tenant page any tenant will do: only shared entries can match there.
  const trail = trailOf(model, tenantFromPath(pathname) ?? "test", pathname);
  if (trail.length === 0) return null;

  return (
    <Breadcrumb aria-label={label}>
      <BreadcrumbList>
        {trail.map((step, index) => (
          <Fragment key={step}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{index === trail.length - 1 ? <BreadcrumbPage>{step}</BreadcrumbPage> : step}</BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
