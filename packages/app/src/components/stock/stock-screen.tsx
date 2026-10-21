import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, StockView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { ImportLink } from "../imports/import-link";
import { CorrectionDialog } from "./correction-dialog";
import { stockLabels } from "./labels";

/**
 * Physical balance and ledger of a selected pair, including inactive historical masters, with what is
 * in transit from and to the location shown apart: it belongs to its transfers, never to the pair (UX-017).
 */
export function StockScreen({ tenant, view, materials, locations, units, locale, messages }: {
  tenant: { code: string; name: string; generation: number; readOnly: boolean }; view: StockView | null;
  materials: MaterialSummary[]; locations: NamedRecordView[]; units: string[]; locale: Locale; messages: Messages;
}) {
  const t = stockLabels(messages);
  const columns: DataTableColumn<StockView["movements"][number]>[] = [
    { id: "date", header: t.date, cell: (row) => row.businessDate },
    { id: "quantity", header: t.movement, cell: (row) => `${row.quantity.startsWith("-") ? "" : "+"}${shownQuantity(row.quantity)} ${row.baseUnit}`, className: "whitespace-normal wrap-anywhere" },
    { id: "reason", header: t.reason, className: "whitespace-normal wrap-anywhere", cell: (row) => <div className="flex min-w-0 flex-col gap-2">
      <span>{row.reason}</span>
      <span className="text-xs text-muted-foreground">{row.actorUsername} · {t.channels[row.channel]}</span>
      <details className="text-xs"><summary className="cursor-pointer">{t.details}</summary>
        <p>{t.source}: {({ correction: t.correction, "goods-receipt": t.goodsReceipt, "transfer-dispatch": t.transferDispatch, "transfer-receipt": t.transferReceipt, "goods-issue": t.goodsIssue, "production-completion": t.productionCompletion } as Record<string, string>)[row.type] ?? row.type} · {row.postingId}</p>
        <p>{t.entered}: {shownQuantity(row.enteredQuantity)} {row.enteredUnit} · {t.factor}: {row.numerator}/{row.denominator}</p>
        <p>{t.after}: {shownQuantity(row.balanceAfter)} {row.baseUnit}</p>
      </details>
    </div> },
  ];
  const editable = view !== null && !tenant.readOnly && view.materialActive && view.locationActive;
  return <div lang={locale} className="flex min-w-0 flex-col gap-6">
    <h1 className="text-2xl font-semibold tracking-tight">{fill(t.heading, { tenant: tenant.name })}</h1>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      {!tenant.readOnly && <ImportLink tenant={tenant.code} label={messages.stockImport.link} section="stock-import" />}
    </div>
    {view === null ? <EmptyState title={t.noMasters} /> : <>
      <form action={`/admin/${tenant.code}/stock`} className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid min-w-0 gap-2"><Label htmlFor="stock-material">{t.material}</Label>
          <NativeSelect id="stock-material" name="material" defaultValue={view.material} className="w-full">
            {materials.map((material) => <NativeSelectOption key={material.id} value={material.id}>{material.id} — {material.description}{material.active ? "" : ` (${t.inactive})`}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid min-w-0 gap-2"><Label htmlFor="stock-location">{t.location}</Label>
          <NativeSelect id="stock-location" name="location" defaultValue={view.location} className="w-full">
            {locations.map((location) => <NativeSelectOption key={location.id} value={location.id}>{location.id} — {location.name}{location.active ? "" : ` (${t.inactive})`}</NativeSelectOption>)}
          </NativeSelect>
        </div><Button type="submit" variant="outline">{t.show}</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div><h2 className="text-sm text-muted-foreground">{t.quantity}</h2><p className="font-mono text-2xl" data-stock-balance>{shownQuantity(view.quantity)} {view.baseUnit}</p></div>
          <div><h2 className="text-sm text-muted-foreground">{t.inTransitFrom}</h2><p className="font-mono text-lg" data-stock-transit-from>{shownQuantity(view.inTransitFrom)} {view.baseUnit}</p></div>
          <div><h2 className="text-sm text-muted-foreground">{t.inTransitTo}</h2><p className="font-mono text-lg" data-stock-transit-to>{shownQuantity(view.inTransitTo)} {view.baseUnit}</p></div>
          <p className="basis-full text-xs text-muted-foreground">{t.transitNote} <Link href={`/admin/${tenant.code}/transfers`} className="underline underline-offset-4">{t.transfers}</Link>
            {view.transitTransfers.map((id) => <span key={id}> · <Link href={`/admin/${tenant.code}/transfers/${id}`} className="font-mono underline underline-offset-4">{id}</Link></span>)}</p>
        </div>
        {editable ? <CorrectionDialog context={{ tenant: tenant.code, generation: tenant.generation }} pair={{ material: view.material, location: view.location }} units={units} labels={t} /> : <p className="text-sm text-muted-foreground">{t.unavailable}</p>}
      </div>
      <section className="flex min-w-0 flex-col gap-3"><h2 className="text-lg font-semibold">{t.ledger}</h2><p className="text-xs text-muted-foreground">{t.recent}</p>
        <DataTable label={t.ledger} columns={columns} rows={view.movements} rowKey={(row) => row.id} empty={t.empty} />
      </section>
    </>}
  </div>;
}
