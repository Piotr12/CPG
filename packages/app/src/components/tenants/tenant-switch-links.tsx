import Link from "next/link";
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { cn } from "@cpg/ui/lib/utils";

/** A tenant the switcher offers. */
export interface TenantOption {
  code: TenantCode;
  name: string;
}

/**
 * The switcher's two links as a segmented control. Rendered on the server as the fallback (links to
 * the tenant homes) and by `TenantSwitcher` once the current path is known.
 */
export function TenantSwitchLinks({
  tenants,
  current,
  hrefFor,
}: {
  tenants: TenantOption[];
  current?: TenantCode;
  hrefFor: (code: TenantCode) => string;
}) {
  return (
    <nav aria-label="Switch tenant" className="flex overflow-hidden rounded-md border border-current/30 text-sm">
      {tenants.map(({ code, name }) => (
        <Link
          key={code}
          href={hrefFor(code)}
          aria-current={code === current ? "page" : undefined}
          className={cn(
            "px-3 py-1 font-medium transition-colors hover:bg-current/10",
            code === current && "bg-foreground text-background hover:bg-foreground",
          )}
        >
          {name}
        </Link>
      ))}
    </nav>
  );
}

/** A tenant's home page. */
export const tenantHome = (code: TenantCode) => `/admin/${code}`;
