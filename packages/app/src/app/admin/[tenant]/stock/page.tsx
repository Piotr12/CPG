import { Suspense } from "react";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import type { Metadata } from "next";
import { connection } from "next/server";
import { parseInput, tenantScope, type LedgerMovementView } from "@cpg/core";
import { stockMovementIdSchema } from "@cpg/core/validators/stock/stock-reversal.schema";
import { isStatisticalUnit } from "@cpg/core/validators/units/unit-registry";
import { STOCK_LEDGER_PAGE_SIZE, stockLedgerQuerySchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { requireUser } from "../../../../auth/require-admin";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { StockScreen } from "../../../../components/stock/stock-screen";

export const metadata: Metadata = { title: "Stock" };
export default function StockPage({ params, searchParams }: PageProps<"/admin/[tenant]/stock">) {
  return <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
    <Suspense fallback={<LoadingMessage />}><Stock params={params} searchParams={searchParams} /></Suspense>
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
  let selected: LedgerMovementView | null = null;
  let units: string[] = [];
  if (materials.length > 0 && locations.length > 0) {
    const search = await searchParams;
    // An emptied filter field submits "", which means "not given": the first record, never Not found (#222).
    const pair = await orNotFound(Promise.resolve().then(() => parseInput(stockLedgerQuerySchema, {
      material: search.material || materials[0].id, location: search.location || locations[0].id, page: search.page,
    })), ["VALIDATION_FAILED"]);
    view = await orNotFound(cradle.stockService.get(pair), ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"]);
    // A ledger page past the last shows the last, as the other lists do.
    const last = Math.max(1, Math.ceil(view.movementCount / STOCK_LEDGER_PAGE_SIZE));
    if (view.page > last) view = await cradle.stockService.get({ ...pair, page: last });
    if (search.movement !== undefined) selected = await orNotFound(Promise.resolve().then(() =>
      cradle.stockService.getMovement(parseInput(stockMovementIdSchema, search.movement), pair)), ["VALIDATION_FAILED", "STOCK_MOVEMENT_NOT_FOUND"]);
    const detail = await cradle.materialService.get(pair.material);
    // A correction is entered in a physical unit, never the report-only SU (#239).
    units = [detail.baseUnit, ...detail.conversions.map(({ unit }) => unit).filter((unit) => !isStatisticalUnit(unit))];
  }
  return <StockScreen selected={selected} tenant={cradle.tenant} view={view} materials={materials} locations={locations} units={units} locale={locale} messages={messages} />;
}
