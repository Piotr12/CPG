import Link from "next/link";
import { connection } from "next/server";
import { LockIcon } from "lucide-react";
import { requestScope, TENANT_NAMES, type TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { currentUser, HOME_PATH } from "../../auth/require-admin";
import { getMessages } from "../../i18n/get-messages";

const COLOURS: Record<TenantCode, string> = {
  test: "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50",
  prod: "border-red-600 bg-neutral-900 text-neutral-50",
};

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
    <div role="status" lang={locale} data-read-only-banner={tenant} className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-6 py-2 text-sm", COLOURS[tenant])}>
      <LockIcon aria-hidden className="size-4 shrink-0" />
      <p>
        <strong>{t.title(TENANT_NAMES[tenant])}</strong> — {t.text}
      </p>
      {user?.role === "admin" && (
        <Link href={HOME_PATH} className="font-medium underline underline-offset-4 sm:ml-auto">
          {t.change}
        </Link>
      )}
    </div>
  );
}
