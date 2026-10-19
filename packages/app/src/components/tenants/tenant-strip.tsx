import { Suspense } from "react";
import { TENANT_NAMES, TENANT_CODES, type TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { TenantSwitchLinks, tenantHome } from "./tenant-switch-links";
import { TenantSwitcher } from "./tenant-switcher";

/** What a page works on: one tenant, or none (`global`: accounts, settings, the tenant chooser). */
export type TenantStripScope = TenantCode | "global";

const STRIPS: Record<TenantStripScope, { label: string; text: string; className: string }> = {
  test: {
    label: "TEST",
    text: "Test tenant — demonstration data, safe to experiment",
    className: "border-b-2 border-amber-600 bg-amber-200 text-amber-950 [&_[data-label]]:bg-amber-800 [&_[data-label]]:text-amber-50",
  },
  prod: {
    label: "PROD",
    text: "Prod tenant — live data",
    className: "border-b-4 border-red-600 bg-neutral-900 text-neutral-50 [&_[data-label]]:bg-red-600 [&_[data-label]]:text-white",
  },
  global: {
    label: "GLOBAL",
    text: "Global — no tenant selected",
    className: "border-b bg-muted text-muted-foreground [&_[data-label]]:bg-border [&_[data-label]]:text-foreground",
  },
};

const TENANTS = TENANT_CODES.map((code) => ({ code, name: TENANT_NAMES[code] }));

/**
 * The always-visible scope indicator (TEN-011): which tenant this page reads and writes, in words
 * and colour, plus the switcher. Rendered by the admin layouts, so no page can leave it out.
 */
export function TenantStrip({ scope }: { scope: TenantStripScope }) {
  const { label, text, className } = STRIPS[scope];
  const current = scope === "global" ? undefined : scope;

  return (
    <div
      role="region"
      aria-label="Active tenant"
      data-tenant={scope}
      className={cn("flex flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm", className)}
    >
      <p className="flex items-center gap-3">
        <span data-label className="rounded px-2 py-0.5 text-xs font-bold tracking-widest">
          {label}
        </span>
        {text}
      </p>
      {/* Without JavaScript (or before the path is known) the links lead to the tenant homes. */}
      <Suspense fallback={<TenantSwitchLinks tenants={TENANTS} current={current} hrefFor={tenantHome} />}>
        <TenantSwitcher tenants={TENANTS} current={current} />
      </Suspense>
    </div>
  );
}
