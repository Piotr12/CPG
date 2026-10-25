import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { StatisticalUnitsScreen } from "../../../../components/materials/statistical-units-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Statistical units". */
export const metadata: Metadata = { title: "Statistical units" };

export default function StatisticalUnitsPage({ params }: PageProps<"/admin/[tenant]/statistical-units">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <StatisticalUnits params={params} />
      </Suspense>
    </main>
  );
}

/**
 * Every finished product's SU factor (#239), read through the tenant's own scope (R05) by any
 * signed-in account, read-only tenants included, like the reports.
 */
async function StatisticalUnits({ params }: Pick<PageProps<"/admin/[tenant]/statistical-units">, "params">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);

  return <StatisticalUnitsScreen tenant={cradle.tenant} rows={await cradle.materialService.statisticalFactors()} locale={locale} messages={messages} />;
}
