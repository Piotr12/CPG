import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { AuditView } from "../../../../components/audit/audit-view";
import { movementIdsOf } from "../../../../components/audit/audit-query";
import { readAuditPage } from "../../../../components/audit/read-audit-page";
import { TENANT_SUBJECT_TYPES } from "../../../../components/audit/subject-types";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Audit". */
export const metadata: Metadata = { title: "Audit" };

export default function TenantAuditPage({ params, searchParams }: PageProps<"/admin/[tenant]/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingMessage />}>
        <TenantAudit params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's audit, read and filtered through that tenant's own scope (R05) by any signed-in account
 * (AUD-009), with the reversal links of the page's stock movements (AUD-004).
 */
async function TenantAudit({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { page, isFirstPage, query } = await readAuditPage(searchParams, (list) => cradle.auditService.listTenant(list));
  const [accounts, reversals] = await Promise.all([
    cradle.userService.usernames(),
    cradle.auditService.reversalLinks(movementIdsOf(page.entries)),
  ]);
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
        selected={query}
        accounts={accounts}
        subjectTypes={TENANT_SUBJECT_TYPES}
        reversals={reversals}
        labels={t}
      />
    </div>
  );
}
