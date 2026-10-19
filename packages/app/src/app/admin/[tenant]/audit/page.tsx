import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppError, tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { AuditView } from "../../../../components/audit/audit-view";
import { readAuditPage } from "../../../../components/audit/read-audit-page";
import { getMessages } from "../../../../i18n/get-messages";

/** The tenant layout's title template puts the tenant first: "Test · Audit". */
export const metadata: Metadata = { title: "Audit" };

export default function TenantAuditPage({ params, searchParams }: PageProps<"/admin/[tenant]/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <TenantAudit params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** One tenant's audit, read through that tenant's own scope (R05), by any signed-in account (AUD-009). */
async function TenantAudit({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([openTenant((await params).tenant), getMessages()]);
  const { page, isFirstPage } = await readAuditPage(searchParams, (query) => cradle.auditService.listTenant(query));
  const { tenant } = cradle;
  const t = messages.audit;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <AuditView
        heading={t.tenantHeading(tenant.name)}
        back={{ href: `/admin/${tenant.code}`, label: tenant.name }}
        intro={
          <>
            {t.tenantIntro}{" "}
            <Link href="/admin/audit" className="font-medium text-foreground underline underline-offset-4">
              {t.toGlobal}
            </Link>
          </>
        }
        page={page}
        path={`/admin/${tenant.code}/audit`}
        isFirstPage={isFirstPage}
        labels={t}
      />
    </div>
  );
}

/** The tenant's scope; a tenant missing from the database renders the not-found state. */
async function openTenant(code: string) {
  try {
    return await tenantScope(code);
  } catch (error) {
    if (error instanceof AppError && error.code === "TENANT_NOT_FOUND") notFound();
    throw error;
  }
}
