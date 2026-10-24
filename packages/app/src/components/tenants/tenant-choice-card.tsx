import type { ReactNode } from "react";
import Link from "next/link";
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { cn } from "@cpg/ui/lib/utils";
import { TENANT_EDGES, TenantTag } from "./tenant-tag";

interface TenantChoiceCardProps {
  tenant: TenantCode;
  href: string;
  /** The tenant's name, the card's title. */
  name: string;
  /** What follows the title: the description, a read-only state, the call to open it. */
  children: ReactNode;
}

/**
 * One tenant on the Tenants page's chooser: a plain card whose edge and TEST / PROD tag say which
 * tenant it is (the card itself is never tinted). The whole card is the link.
 */
export function TenantChoiceCard({ tenant, href, name, children }: TenantChoiceCardProps) {
  return (
    <Link
      href={href}
      data-tenant-choice={tenant}
      className={cn("flex flex-col items-start gap-1 rounded-lg border bg-card p-4 transition-colors hover:bg-muted", TENANT_EDGES[tenant])}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-lg font-semibold">{name}</span>
        <TenantTag tenant={tenant} />
      </span>
      {children}
    </Link>
  );
}
