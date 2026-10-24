"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";
import { TENANT_CODES, type TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { cn } from "@cpg/ui/lib/utils";
import { switchTenantPath } from "./switch-tenant-path";

/** The pressed side wears its tenant's tag colours and edge (TEN-011); the words TEST and PROD always say it too. */
const PRESSED: Record<TenantCode, string> = {
  test: "bg-tenant-test-tag text-tenant-test-tag-foreground ring-1 ring-inset ring-tenant-test-edge hover:bg-tenant-test-tag",
  prod: "bg-tenant-prod-tag text-tenant-prod-tag-foreground border-b-2 border-tenant-prod-edge hover:bg-tenant-prod-tag",
};

const OPTION =
  "flex min-h-7 items-center justify-center rounded-sm px-2 uppercase transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden " +
  // In the rail the two options stack, each one letter wide.
  "group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:tracking-normal";

interface TenantSwitchProps {
  /** The tenant the menu targets: the page's own on a tenant page, the remembered one elsewhere. */
  tenant: TenantCode;
  pathname: string;
  /** Whether the page belongs to a tenant: then both sides are links; elsewhere, toggles. */
  isTenantPage: boolean;
  /** The group's accessible name: "Tenant: Test" on a tenant page, "Menu shows: Test" elsewhere (Q7). */
  label: string;
  names: Record<TenantCode, string>;
  /** Which tenants are read-only now (R05): their side shows a lock, with `readOnlyLabel` in their accessible name. */
  readOnly: Record<TenantCode, boolean>;
  readOnlyLabel: string;
  /** On a page outside any tenant, which tenant the menu should target from now on. */
  onChoose: (tenant: TenantCode) => void;
  /** Mobile top bar: a narrower switch. */
  compact?: boolean;
  /** The icon rail: each side shows its tenant's first letter, and keeps the name as its accessible name. */
  rail?: boolean;
  /** Following a link closes the drawer it sits in. */
  onNavigate?: () => void;
}

/**
 * The TEST | PROD switch (Q7 of the sidebar spec, TEN-010/012). On a tenant page each side is a link
 * to the same section in that tenant, so it works without JavaScript and lands on the list rather
 * than another tenant's record. On a page that belongs to no tenant the page stays put: each side is
 * an `aria-pressed` toggle that re-targets the menu.
 */
export function TenantSwitch({
  tenant,
  pathname,
  isTenantPage,
  label,
  names,
  readOnly,
  readOnlyLabel,
  onChoose,
  compact = false,
  rail = false,
  onNavigate,
}: TenantSwitchProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-tenant-switch={tenant}
      className={cn(
        "grid grid-cols-2 gap-1 rounded-md border bg-background p-1 text-xs font-semibold tracking-widest",
        "group-data-[collapsible=icon]:grid-cols-1 group-data-[collapsible=icon]:p-0",
        compact ? "w-32" : "w-full",
      )}
    >
      {TENANT_CODES.map((code) => {
        const isCurrent = code === tenant;
        const className = cn(OPTION, "gap-1", isCurrent ? PRESSED[code] : "text-muted-foreground");
        const content = (
          <>
            {readOnly[code] && <LockIcon aria-hidden data-read-only className="size-3 shrink-0 group-data-[collapsible=icon]:hidden" />}
            {rail ? names[code].charAt(0) : names[code]}
          </>
        );
        // The name keeps the visible tenant name first, so what a reader sees is what is announced (WCAG 2.5.3);
        // in the rail the letter alone would be the name, so the full one is given.
        const name = readOnly[code] ? `${names[code]} (${readOnlyLabel})` : rail ? names[code] : undefined;
        return isTenantPage ? (
          <Link
            key={code}
            href={switchTenantPath(pathname, code)}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={name}
            onClick={onNavigate}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <button key={code} type="button" aria-pressed={isCurrent} aria-label={name} onClick={() => onChoose(code)} className={className}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
