import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { forecastFilterSchema } from "@cpg/core/validators/forecasts/forecast.schema";
import { DOCUMENT_PAGE_SIZE, pageSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { requireUser } from "../../../../auth/require-admin";
import { ForecastsScreen } from "../../../../components/forecasts/forecasts-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Forecasts". */
export const metadata: Metadata = { title: "Forecasts" };

export default function ForecastsPage({ params, searchParams }: PageProps<"/admin/[tenant]/forecasts">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Forecasts params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's forecasts, read through that tenant's own scope (R05) by any signed-in account,
 * narrowed by `?material=&location=`, a page of 100 at a time (`?page=`). A filter that isn't a
 * business ID is ignored, so a mistyped link still shows the list; a page past the last shows the
 * last, and an invalid one is not found.
 */
async function Forecasts({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/forecasts">, "params" | "searchParams">) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }, query] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
    searchParams,
  ]);
  const parsed = forecastFilterSchema.safeParse({ material: first(query.material), location: first(query.location) });
  const filter = parsed.success ? parsed.data : {};
  const requested = pageSchema.safeParse(first(query.page));
  if (!requested.success) notFound();
  const pages = Math.max(1, Math.ceil((await cradle.forecastService.count(filter)) / DOCUMENT_PAGE_SIZE));
  const page = Math.min(requested.data, pages);
  const forecasts = await cradle.forecastService.list(filter, page);
  const materials = await cradle.materialService.list();
  const locations = await cradle.locationService.list();

  return (
    <ForecastsScreen
      tenant={cradle.tenant}
      forecasts={forecasts}
      materials={materials}
      locations={locations}
      filter={filter}
      page={page}
      pages={pages}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
    />
  );
}

/** A query parameter's first value; repeated ones (`?material=a&material=b`) arrive as an array. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
