import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { parseInput, tenantScope } from "@cpg/core";
import { stockPairSchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { requireUser } from "../../../../auth/require-admin";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { StockScreen } from "../../../../components/stock/stock-screen";

export const metadata: Metadata = { title: "Stock" };
export default function StockPage({ params, searchParams }: PageProps<"/admin/[tenant]/stock">) {
  return <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
    <Suspense fallback={<div aria-busy="true" className="min-h-40" />}><Stock params={params} searchParams={searchParams} /></Suspense>
  </main>;
}
async function Stock({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/stock">, "params" | "searchParams">) {
  await connection(); await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  const materials = await cradle.materialService.list();
  const locations = await cradle.locationService.list();
  let view = null;
  let units: string[] = [];
  if (materials.length > 0 && locations.length > 0) {
    const search = await searchParams;
    const pair = await orNotFound(Promise.resolve().then(() => parseInput(stockPairSchema, {
      material: search.material ?? materials[0].id, location: search.location ?? locations[0].id,
    })), ["VALIDATION_FAILED"]);
    view = await orNotFound(cradle.stockService.get(pair), ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"]);
    const detail = await cradle.materialService.get(pair.material);
    units = [detail.baseUnit, ...detail.conversions.map(({ unit }) => unit)];
  }
  return <StockScreen tenant={cradle.tenant} view={view} materials={materials} locations={locations} units={units} locale={locale} messages={messages} />;
}
