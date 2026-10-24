import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireUser } from "../../../../auth/require-admin";
import { ImportScreen } from "../../../../components/imports/import-screen";
import { stockImportLabels } from "../../../../components/imports/stock-labels";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Stock import". */
export const metadata: Metadata = { title: "Stock import" };

export default function StockImportPage({ params }: PageProps<"/admin/[tenant]/stock-import">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <StockImport params={params} />
      </Suspense>
    </main>
  );
}

/**
 * The stock import for one tenant (spec 2026-10-20--2225UTC-stock-import): both roles (STX-018). The
 * tenant's read-only flag blocks the upload and the commit (STX-019).
 */
async function StockImport({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { code, name, generation, readOnly } = cradle.tenant;

  return (
    <div lang={locale}>
      <PageHeader title={messages.stockImport.heading(name)} description={messages.stockImport.intro} />
      <ImportScreen tenant={{ code, name, generation, readOnly }} labels={stockImportLabels(messages)} kind="stock" />
    </div>
  );
}
