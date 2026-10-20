import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { stockReportQuerySchema } from "@cpg/core/validators/reports/stock-report.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { StockReportScreen } from "../../../../../components/reports/stock-report-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Stock report". */
export const metadata: Metadata = { title: "Stock report" };

export default function StockReportPage({ params, searchParams }: PageProps<"/admin/[tenant]/reports/stock">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingMessage />}>
        <StockReport params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One page of the tenant's current stock report (E13-S01), read through that tenant's own scope (R05)
 * by any signed-in account, read-only tenants included (TEN-018). A malformed query, or a filter
 * naming a record this tenant doesn't have, is the not-found state; a page past the last shows the last.
 */
async function StockReport({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/reports/stock">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const search = await searchParams;
  const query = stockReportQuerySchema.safeParse(search);
  if (!query.success) notFound();
  const missing = ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"];
  let report = await orNotFound(cradle.stockReportService.read(search), missing);
  const last = Math.max(1, Math.ceil(report.total / report.pageSize));
  if (report.page > last) report = await cradle.stockReportService.read({ ...search, page: String(last) });

  return (
    <StockReportScreen
      tenant={cradle.tenant}
      report={report}
      selected={query.data}
      materials={await cradle.materialService.list()}
      locations={await cradle.locationService.list()}
      locale={locale}
      messages={messages}
    />
  );
}
