import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { LockIcon } from "lucide-react";
import { requestScope, TENANT_NAMES, type TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { currentUser, HOME_PATH } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";
import { TENANT_EDGES, TENANT_TAG_COLOURS } from "./tenant-tag";

interface TenantBannerProps {
  tenant: TenantCode;
  lang: string;
  /** The bold first words, "Prod is read-only", which say the state in words beside the lock. */
  title: string;
  children: ReactNode;
  /** On the right from `sm`: the admin's way to the Tenants page. */
  action?: ReactNode;
}

/**
 * The full-width strip under the tenant header for a read-only tenant: the tenant's tag colours and
 * edge (tenant tokens only; `warning` never means Test), a lock and the words.
 */
export function TenantBanner({ tenant, lang, title, children, action }: TenantBannerProps) {
  return (
    <div
      role="status"
      lang={lang}
      data-read-only-banner={tenant}
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-sm md:px-6", TENANT_TAG_COLOURS[tenant], TENANT_EDGES[tenant])}
    >
      <LockIcon aria-hidden className="size-4 shrink-0" />
      {/* The sentence fills the lock's row, so the lock never sits alone; the admin's link wraps below when short of room. */}
      <p className="min-w-0 flex-1 basis-64">
        <strong className="font-semibold">{title}</strong> — {children}
      </p>
      {action}
    </div>
  );
}

/**
 * Under the tenant header on every page of a read-only tenant (R05): says, in the reader's language,
 * that business changes are blocked and what still works; the admin also gets a link to Tenants,
 * where the flag is lifted. Nothing for a writable tenant. Hiding the write controls stays with each
 * screen; the server refuses the write either way (`TENANT_READ_ONLY`).
 */
export async function ReadOnlyBanner({ tenant }: { tenant: TenantCode }) {
  await connection();
  const [{ tenantService }, { locale, messages }, user] = await Promise.all([
    requestScope().then((scope) => scope.cradle),
    getMessages(),
    currentUser(),
  ]);
  if (!(await tenantService.get(tenant)).readOnly) return null;
  const t = messages.nav.readOnlyBanner;

  return (
    <TenantBanner
      tenant={tenant}
      lang={locale}
      title={t.title(TENANT_NAMES[tenant])}
      action={
        user?.role === "admin" && (
          <Link href={HOME_PATH} className="font-medium underline underline-offset-4 sm:ml-auto">
            {t.change}
          </Link>
        )
      }
    >
      {t.text}
    </TenantBanner>
  );
}
