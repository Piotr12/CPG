import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { AuditView } from "../../../../components/audit/audit-view";
import { readAuditPage } from "../../../../components/audit/read-audit-page";
import { getMessages } from "../../../../i18n/get-messages";

export const metadata: Metadata = { title: "Global audit · Caveman Planning Good" };

export default function GlobalAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <GlobalAudit searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Every signed-in account reads the Global audit; nobody can change it (AUD-009, AUD-010). */
async function GlobalAudit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([requestScope(), getMessages()]);
  const { page, isFirstPage } = await readAuditPage(searchParams, (query) => cradle.auditService.listGlobal(query));
  const t = messages.audit;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <AuditView
        heading={t.globalHeading}
        back={{ href: "/admin", label: t.back }}
        intro={t.globalIntro}
        page={page}
        path="/admin/audit"
        isFirstPage={isFirstPage}
        labels={t}
      />
    </div>
  );
}
