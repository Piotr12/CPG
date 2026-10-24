import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireAdmin } from "../../../../auth/require-admin";
import { ImportScreen } from "../../../../components/imports/import-screen";
import { importLabels } from "../../../../components/imports/labels";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Import". */
export const metadata: Metadata = { title: "Import" };

export default function ImportPage({ params }: PageProps<"/admin/[tenant]/import">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Import params={params} />
      </Suspense>
    </main>
  );
}

/**
 * The master-data and BOM import for one tenant (spec 2026-10-20--0908UTC-master-data-bom-import):
 * admin only, a normal user is sent to `/admin` (Q12). The tenant's read-only flag blocks the upload
 * and the commit (Q11).
 */
async function Import({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  await requireAdmin();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { code, name, generation, readOnly } = cradle.tenant;

  return (
    <div lang={locale}>
      <PageHeader title={messages.imports.heading(name)} description={messages.imports.intro} />
      <ImportScreen tenant={{ code, name, generation, readOnly }} labels={importLabels(messages)} />
    </div>
  );
}
