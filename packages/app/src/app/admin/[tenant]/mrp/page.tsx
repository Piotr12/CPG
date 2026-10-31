import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppError, tenantScope, type MrpLatestView } from "@cpg/core";
import { mrpReportPageQuerySchema } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { MrpRunScreen } from "../../../../components/mrp/mrp-run-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { runMrp } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · MRP". */
export const metadata: Metadata = { title: "MRP" };

export default function MrpPage({ params, searchParams }: PageProps<"/admin/[tenant]/mrp">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Mrp params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** No run yet is the page's empty state, not an error. */
function noRun(error: unknown): null {
  if (error instanceof AppError && error.code === "MRP_RUN_NOT_FOUND") return null;
  throw error;
}

/**
 * One tenant's MRP page (E14-S02, E18-S01), read through that tenant's own scope (R05) by any signed-in
 * account, read-only tenants included (TEN-018): the latest run and its report, filtered by
 * `?material&location&page`, and Run MRP bound to the tenant and the dataset generation this page
 * showed. A malformed query, or a filter naming a record this tenant doesn't have, is the not-found
 * state; a page past the last shows the last.
 */
async function Mrp({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/mrp">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { tenant } = cradle;
  const search = await searchParams;
  const query = mrpReportPageQuerySchema.safeParse(search);
  if (!query.success) notFound();
  const missing = ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"];
  const read = (raw: Record<string, unknown>): Promise<MrpLatestView | null> => orNotFound(cradle.mrpRunService.latest(raw).catch(noRun), missing);
  let report = await read(search);
  if (report) {
    const last = Math.max(1, Math.ceil(report.total / report.pageSize));
    if (report.page > last) report = await read({ ...search, page: String(last) });
  }

  return (
    <MrpRunScreen
      tenant={tenant}
      report={report}
      selected={query.data}
      materials={await cradle.materialService.list()}
      locations={await cradle.locationService.list()}
      action={runMrp.bind(null, tenant.code, tenant.generation)}
      locale={locale}
      messages={messages}
    />
  );
}
