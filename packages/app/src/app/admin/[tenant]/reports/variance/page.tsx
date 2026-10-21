import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { varianceReportFieldsSchema, varianceReportQuerySchema } from "@cpg/core/validators/reports/variance-report.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { VarianceReportScreen } from "../../../../../components/reports/variance-report-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Variance report". */
export const metadata: Metadata = { title: "Variance report" };

export default function VarianceReportPage({ params, searchParams }: PageProps<"/admin/[tenant]/reports/variance">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingMessage />}>
        <VarianceReport params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One page of the tenant's production variance report (E13-S02), read through that tenant's own scope
 * (R05) by any signed-in account, read-only tenants included (TEN-018). A range that ends before it
 * starts keeps the form with the error beside To; any other malformed query, or a filter naming a record
 * this tenant doesn't have, is the not-found state. A page past the last shows the last.
 */
async function VarianceReport({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/reports/variance">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const search = await searchParams;
  const fields = varianceReportFieldsSchema.safeParse(search);
  if (!fields.success) notFound();
  const screen = { tenant: cradle.tenant, materials: await cradle.materialService.list(), locations: await cradle.locationService.list(), locale, messages };
  // Every field is well formed, so the one check left to fail is the range ending before it starts (spec Q6).
  if (!varianceReportQuerySchema.safeParse(search).success) {
    return <VarianceReportScreen {...screen} report={null} selected={fields.data} rangeError={messages.varianceReport.rangeError} />;
  }
  const missing = ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"];
  let report = await orNotFound(cradle.varianceReportService.read(search), missing);
  const last = Math.max(1, Math.ceil(report.total / report.pageSize));
  if (report.page > last) report = await cradle.varianceReportService.read({ ...search, page: String(last) });

  return <VarianceReportScreen {...screen} report={report} selected={fields.data} />;
}
