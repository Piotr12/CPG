import { Suspense } from "react";
import { connection } from "next/server";
import type { TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { currentUser } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import { navModel } from "../layout/nav-items";
import { SectionTrail } from "./section-trail";

/** What a page works on: one tenant, or none (`global`: accounts, settings, the tenant cards). */
export type TenantHeaderScope = TenantCode | "global";

const HEADERS: Record<TenantHeaderScope, { tag: string; edge: string; tagClassName: string }> = {
  test: { tag: "TEST", edge: "border-t-amber-500", tagClassName: "bg-amber-200 text-amber-950" },
  prod: { tag: "PROD", edge: "border-t-red-600", tagClassName: "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900" },
  global: { tag: "GLOBAL", edge: "border-t-border", tagClassName: "bg-muted text-muted-foreground" },
};

const ids = (scope: TenantHeaderScope) => ({ tag: `tenant-header-tag-${scope}`, text: `tenant-header-text-${scope}` });

/**
 * The always-visible scope indicator (TEN-011), rendered by the admin layouts so no page can leave it
 * out. The static shell holds only language-neutral parts: the TEST/PROD/GLOBAL tag and the row's
 * 3 px top edge in the tenant's colour. The row's text and the section trail stream in, in the
 * reader's language, and complete the region's accessible name ("TEST Active tenant").
 */
export function TenantHeader({ scope }: { scope: TenantHeaderScope }) {
  const { tag, edge, tagClassName } = HEADERS[scope];
  return (
    <div
      role="region"
      aria-labelledby={`${ids(scope).tag} ${ids(scope).text}`}
      data-tenant={scope}
      className={cn("flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-t-[3px] border-b px-6 py-2 text-sm", edge)}
    >
      <span id={ids(scope).tag} data-label className={cn("rounded px-2 py-0.5 text-xs font-bold tracking-widest", tagClassName)}>
        {tag}
      </span>
      <Suspense fallback={null}>
        <TenantHeaderText scope={scope} />
      </Suspense>
    </div>
  );
}

/**
 * The row's words, in the reader's language: the trail, then "Active tenant" for screen readers (the
 * tag already says which), or on a shared page a visible note that switching tenant won't change it.
 */
export async function TenantHeaderText({ scope }: { scope: TenantHeaderScope }) {
  await connection();
  const [{ locale, messages }, user] = await Promise.all([getMessages(), currentUser()]);
  const model = navModel(user, messages.nav);
  const isGlobal = scope === "global";

  return (
    <span lang={locale} className="contents">
      {model && <SectionTrail model={model} label={messages.nav.trail} />}
      <span id={ids(scope).text} className={isGlobal ? "text-xs text-muted-foreground sm:ml-auto" : "sr-only"}>
        {messages.tenants.header[isGlobal ? "global" : "tenant"]}
      </span>
    </span>
  );
}
