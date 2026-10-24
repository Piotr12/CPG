"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage } from "@cpg/ui/components/breadcrumb";
import { tenantFromPath } from "../layout/current-path";
import { trailOf, type NavModel, type TrailStep } from "../layout/nav-tree";

/** The last step is where you are; an entry with a record open under it links back to its list. */
function Step({ step, isLast }: { step: TrailStep; isLast: boolean }) {
  if (isLast) return <BreadcrumbPage className={step.record ? "font-mono" : undefined}>{step.label}</BreadcrumbPage>;
  if (step.href === undefined) return step.label;
  return (
    <BreadcrumbLink asChild className="underline underline-offset-4">
      <Link href={step.href}>{step.label}</Link>
    </BreadcrumbLink>
  );
}

/**
 * The `›` before a step, inside the step's own item rather than shadcn's separate `li`, so a step that
 * wraps to the next line at 320 px takes its separator along instead of leaving it at the line's end.
 */
function TrailSeparator() {
  return (
    <span data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className="[&>svg]:size-3.5">
      <ChevronRightIcon />
    </span>
  );
}

/**
 * Where the open page sits in the sidebar, after the tenant header's tag: `TEST › Master data ›
 * Materials`, and on a detail page `› 00000005` with Materials a link to the list. Read from the same
 * tree the sidebar shows, so the two never disagree; nothing when the sidebar doesn't hold the page.
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
          <BreadcrumbItem key={`step-${index}`}>
            <TrailSeparator />
            <Step step={step} isLast={index === trail.length - 1} />
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
