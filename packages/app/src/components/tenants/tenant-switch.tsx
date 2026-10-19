"use client";

import Link from "next/link";
import { TENANT_CODES, type TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { cn } from "@cpg/ui/lib/utils";
import { switchTenantPath } from "./switch-tenant-path";

/** The pressed side wears its tenant's colours (TEN-011); the words TEST and PROD always say it too. */
const PRESSED: Record<TenantCode, string> = {
  test: "bg-amber-200 text-amber-950 shadow-[inset_0_0_0_1px_var(--color-amber-500)] hover:bg-amber-200",
  prod: "bg-neutral-900 text-neutral-50 shadow-[inset_0_-2px_0_var(--color-red-600)] hover:bg-neutral-900 dark:bg-neutral-950",
};

const OPTION =
  "flex min-h-7 items-center justify-center rounded-[5px] px-2 uppercase transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden " +
  // In the rail the two options stack and shrink to fit 3 rem.
  "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:text-[9px] group-data-[collapsible=icon]:tracking-normal";

interface TenantSwitchProps {
  /** The tenant the menu targets: the page's own on a tenant page, the remembered one elsewhere. */
  tenant: TenantCode;
  pathname: string;
  /** Whether the page belongs to a tenant: then both sides are links; elsewhere, toggles. */
  isTenantPage: boolean;
  /** The group's accessible name: "Tenant: Test" on a tenant page, "Menu shows: Test" elsewhere (Q7). */
  label: string;
  names: Record<TenantCode, string>;
  /** On a page outside any tenant, which tenant the menu should target from now on. */
  onChoose: (tenant: TenantCode) => void;
  /** Mobile top bar: a narrower switch. */
  compact?: boolean;
  /** Following a link closes the drawer it sits in. */
  onNavigate?: () => void;
}

/**
 * The TEST | PROD switch (Q7 of the sidebar spec, TEN-010/012). On a tenant page each side is a link
 * to the same section in that tenant, so it works without JavaScript and lands on the list rather
 * than another tenant's record. On a page that belongs to no tenant the page stays put: each side is
 * an `aria-pressed` toggle that re-targets the menu.
 */
export function TenantSwitch({ tenant, pathname, isTenantPage, label, names, onChoose, compact = false, onNavigate }: TenantSwitchProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-tenant-switch={tenant}
      className={cn(
        "grid grid-cols-2 gap-0.5 rounded-md border bg-background p-0.5 text-xs font-bold tracking-widest",
        "group-data-[collapsible=icon]:grid-cols-1",
        compact ? "w-32" : "w-full",
      )}
    >
      {TENANT_CODES.map((code) => {
        const isCurrent = code === tenant;
        const className = cn(OPTION, isCurrent ? PRESSED[code] : "text-muted-foreground");
        return isTenantPage ? (
          <Link
            key={code}
            href={switchTenantPath(pathname, code)}
            aria-current={isCurrent ? "page" : undefined}
            onClick={onNavigate}
            className={className}
          >
            {names[code]}
          </Link>
        ) : (
          <button key={code} type="button" aria-pressed={isCurrent} onClick={() => onChoose(code)} className={className}>
            {names[code]}
          </button>
        );
      })}
    </div>
  );
}
