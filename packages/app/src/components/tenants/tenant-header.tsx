import { Suspense } from "react";
import { connection } from "next/server";
import { cn } from "@cpg/ui/lib/utils";
import { currentUser } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import { navModel } from "../layout/nav-items";
import { SectionTrail } from "./section-trail";
import { TenantTag, type TenantScope } from "./tenant-tag";

/** What a page works on: one tenant, or none (`global`: accounts, settings, the tenant cards). */
export type TenantHeaderScope = TenantScope;

/** The row's 3 px top edge (the spec's one documented thick border), in the tenant's edge token. */
const EDGES: Record<TenantHeaderScope, string> = {
  test: "border-t-tenant-test-edge",
  prod: "border-t-tenant-prod-edge",
  global: "border-t-border",
};

const ids = (scope: TenantHeaderScope) => ({ tag: `tenant-header-tag-${scope}`, text: `tenant-header-text-${scope}` });

/**
 * The always-visible scope indicator (TEN-011), rendered by the admin layouts so no page can leave it
 * out. The static shell holds only language-neutral parts: the TEST/PROD/GLOBAL tag and the row's
 * 3 px top edge in the tenant's colour. The row's text and the section trail stream in, in the
 * reader's language, and complete the region's accessible name ("TEST Active tenant"). It stays in the
 * content column at every width, so the tenant is named in words even when the sidebar's switch is
 * folded to its T / P letters in the rail.
 */
export function TenantHeader({ scope }: { scope: TenantHeaderScope }) {
  return (
    <div
      role="region"
      aria-labelledby={`${ids(scope).tag} ${ids(scope).text}`}
      data-tenant={scope}
      className={cn("flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-t-[3px] border-b px-4 py-2 text-sm md:px-6", EDGES[scope])}
    >
      <TenantTag tenant={scope} id={ids(scope).tag} />
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
