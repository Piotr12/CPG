import Link from "next/link";
import type { LedgerMovementView, Locale, SourceDocument, MaterialSummary, NamedRecordView, StockView } from "@cpg/core";
import { STOCK_LEDGER_PAGE_SIZE } from "@cpg/core/validators/stock/stock-correction.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { CorrectionDialog } from "./correction-dialog";
import { stockLabels } from "./labels";

/** The screen that lists each kind of source document: a receipt is on its order, an issue on its shipment. */
const DOCUMENT_SECTIONS: Record<SourceDocument["type"], string> = { "purchase-order": "purchase-orders", shipment: "shipments", transfer: "transfers" };

/**
 * Physical balance and ledger of a selected pair, including inactive historical masters, with what is
 * in transit from and to the location shown apart: it belongs to its transfers, never to the pair (UX-017).
 */
export function StockScreen({ tenant, view, materials, locations, units, locale, messages }: {
  tenant: { code: string; name: string; generation: number; readOnly: boolean }; view: StockView | null;
  materials: MaterialSummary[]; locations: NamedRecordView[]; units: string[]; locale: Locale; messages: Messages;
}) {
  const t = stockLabels(messages);
  const path = `/admin/${tenant.code}`;
  const types: Record<string, string> = { correction: t.correction, "goods-receipt": t.goodsReceipt, "transfer-dispatch": t.transferDispatch, "transfer-receipt": t.transferReceipt, "goods-issue": t.goodsIssue };
  const records: Record<string, string> = t.records;
  // A narrow screen scrolls the ledger sideways rather than squeezing a column to one character.
  const columns: DataTableColumn<LedgerMovementView>[] = [
    { id: "date", header: t.date, cell: (row) => row.businessDate },
    { id: "type", header: t.type, cell: (row) => types[row.type] ?? row.type },
    { id: "quantity", header: t.movement, cell: (row) => `${row.quantity.startsWith("-") ? "" : "+"}${shownQuantity(row.quantity)} ${row.baseUnit}` },
    { id: "source", header: t.source, className: "min-w-36 whitespace-normal", cell: ({ type, source }) => source.document === null ? <span className="text-muted-foreground">{type === "correction" ? t.ownSource : "—"}</span> : <div className="flex min-w-0 flex-col gap-1">
      <Link href={`${path}/${DOCUMENT_SECTIONS[source.document.type]}/${source.document.id}`} className="underline underline-offset-4">{fill(t.documents[source.document.type], { id: source.document.id })}</Link>
      {type in records && <span className="text-xs text-muted-foreground">{fill(records[type], { id: source.id! })}</span>}
    </div> },
    { id: "reason", header: t.reason, className: "min-w-48 whitespace-normal wrap-anywhere", cell: (row) => <div className="flex min-w-0 flex-col gap-2">
      <span>{row.reason}</span>
      <span className="text-xs text-muted-foreground">{row.actorUsername} · {t.channels[row.channel]}</span>
      <details className="text-xs"><summary className="cursor-pointer">{t.details}</summary>
        <p>{t.posting}: {row.postingId}</p>
        <p>{t.entered}: {shownQuantity(row.enteredQuantity)} {row.enteredUnit} · {t.factor}: {row.numerator}/{row.denominator}</p>
        <p>{t.after}: {shownQuantity(row.balanceAfter)} {row.baseUnit}</p>
      </details>
    </div> },
  ];
  const editable = view !== null && !tenant.readOnly && view.materialActive && view.locationActive;
  return <div lang={locale} className="flex min-w-0 flex-col gap-6">
    <h1 className="text-2xl font-semibold tracking-tight">{fill(t.heading, { tenant: tenant.name })}</h1>
    <p className="text-sm text-muted-foreground">{t.intro} <Link href={`${path}/reports/stock`} className="underline underline-offset-4">{t.report}</Link></p>
    {view === null ? <EmptyState title={t.noMasters} /> : <>
      <form action={`${path}/stock`} className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
          <p className="basis-full text-xs text-muted-foreground">{t.transitNote} <Link href={`${path}/transfers`} className="underline underline-offset-4">{t.transfers}</Link>
            {view.transitTransfers.map((id) => <span key={id}> · <Link href={`${path}/transfers/${id}`} className="font-mono underline underline-offset-4">{id}</Link></span>)}</p>
        </div>
        {editable ? <CorrectionDialog context={{ tenant: tenant.code, generation: tenant.generation }} pair={{ material: view.material, location: view.location }} units={units} labels={t} /> : <p className="text-sm text-muted-foreground">{t.unavailable}</p>}
      </div>
      <section className="flex min-w-0 flex-col gap-3"><h2 className="text-lg font-semibold">{t.ledger}</h2><p className="text-xs text-muted-foreground">{t.recent}</p>
        <DataTable label={t.ledger} columns={columns} rows={view.movements} rowKey={(row) => row.id} empty={t.empty} pagination={
          <PageLinks page={view.page} pages={Math.ceil(view.movementCount / STOCK_LEDGER_PAGE_SIZE)} labels={t}
            href={(page) => `${path}/stock?${new URLSearchParams({ material: view.material, location: view.location, page: String(page) })}`} />
        } />
      </section>
    </>}
  </div>;
}
