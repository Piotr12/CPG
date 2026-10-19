import { Suspense } from "react";
import { connection } from "next/server";
import { requestScope, TENANT_NAMES, TENANT_CODES, type TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { getMessages } from "../../i18n/get-messages";
import { TenantSwitchLinks, tenantHome } from "./tenant-switch-links";
import { TenantSwitcher } from "./tenant-switcher";

/** What a page works on: one tenant, or none (`global`: accounts, settings, the tenant chooser). */
export type TenantStripScope = TenantCode | "global";

const LABEL_ID = "tenant-strip-label";
const TEXT_ID = "tenant-strip-text";

const STRIPS: Record<TenantStripScope, { label: string; className: string }> = {
  test: {
    label: "TEST",
    className: "border-b-2 border-amber-600 bg-amber-200 text-amber-950 [&_[data-label]]:bg-amber-800 [&_[data-label]]:text-amber-50",
  },
  prod: {
    label: "PROD",
    className: "border-b-4 border-red-600 bg-neutral-900 text-neutral-50 [&_[data-label]]:bg-red-600 [&_[data-label]]:text-white",
  },
  global: {
    label: "GLOBAL",
    className: "border-b bg-muted text-muted-foreground [&_[data-label]]:bg-border [&_[data-label]]:text-foreground",
  },
};

const TENANTS = TENANT_CODES.map((code) => ({ code, name: TENANT_NAMES[code] }));

/**
 * The always-visible scope indicator (TEN-011): which tenant this page reads and writes, plus the
 * switcher. Rendered by the admin layouts, so no page can leave it out. The static shell carries
 * only language-neutral parts (the TEST/PROD/GLOBAL label, the colour and the tenant names); the
 * sentence describing the scope streams in, in the reader's language, and completes the strip's
 * accessible name ("TEST Test tenant — …"), with a read-only tenant's Read-only label (R05).
 */
export function TenantStrip({ scope }: { scope: TenantStripScope }) {
  const { label, className } = STRIPS[scope];
  const current = scope === "global" ? undefined : scope;

  return (
    <div
      role="region"
      aria-labelledby={`${LABEL_ID} ${TEXT_ID}`}
      data-tenant={scope}
      className={cn("flex flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm", className)}
    >
      <p className="flex items-center gap-3">
        <span id={LABEL_ID} data-label className="rounded px-2 py-0.5 text-xs font-bold tracking-widest">
          {label}
        </span>
        <Suspense fallback={null}>
          <TenantStripText scope={scope} />
        </Suspense>
      </p>
      {/* Without JavaScript (or before the path is known) the links lead to the tenant homes. */}
      <Suspense fallback={<TenantSwitchLinks tenants={TENANTS} current={current} hrefFor={tenantHome} />}>
        <TenantSwitcher tenants={TENANTS} current={current} />
      </Suspense>
    </div>
  );
}

/**
 * The scope in words, in the reader's language, and whether a tenant is read-only now. The flag is
 * global tenant metadata, read through the request scope: this component sits outside the tenant
 * entry points, so it never opens the tenant itself. The spaces between the parts keep the strip's
 * accessible name readable: the flex gap alone would run the words together.
 */
export async function TenantStripText({ scope }: { scope: TenantStripScope }) {
  await connection();
  const [{ locale, messages }, readOnly] = await Promise.all([getMessages(), isReadOnly(scope)]);
  const t = messages.tenants;
  return (
    <span id={TEXT_ID} lang={locale} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {t.strip[scope]}
      {readOnly && (
        <>
          {" "}
          <span data-read-only className="rounded-full bg-background px-2 py-0.5 text-xs font-bold tracking-wide text-foreground uppercase">
            {t.readOnly}
          </span>{" "}
          <span>{t.readOnlyStrip}</span>
        </>
      )}
    </span>
  );
}

async function isReadOnly(scope: TenantStripScope): Promise<boolean> {
  if (scope === "global") return false;
  return (await (await requestScope()).cradle.tenantService.get(scope)).readOnly;
}
