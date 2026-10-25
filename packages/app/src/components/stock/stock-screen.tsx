import Link from "next/link";
import type { LedgerMovementView, Locale, SourceDocument, MaterialSummary, NamedRecordView, StockView } from "@cpg/core";
import { STOCK_LEDGER_PAGE_SIZE } from "@cpg/core/validators/stock/stock-correction.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { FilterAutocomplete } from "@cpg/ui/backend/forms/filter-autocomplete";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { ImportLink } from "../imports/import-link";
import { materialFilterOptions, materialPicker } from "../materials/material-picker";
import { recordOptions, recordPicker } from "../named-records/record-picker";
import { CorrectionDialog } from "./correction-dialog";
import { stockLabels } from "./labels";
import { ReversalControls } from "./reversal-controls";

/** The screen that lists each kind of source document: a receipt is on its order, an issue on its shipment, a completion on its production order. */
const DOCUMENT_SECTIONS: Record<SourceDocument["type"], string> = { "purchase-order": "purchase-orders", shipment: "shipments", transfer: "transfers", "production-order": "production-orders" };

/**
 * Physical balance and ledger of a selected pair, including inactive historical masters, with what is
 * in transit from and to the location shown apart: it belongs to its transfers, never to the pair (UX-017).
 */
export function StockScreen({ tenant, view, materials, locations, units, locale, messages, selected = null }: {
  tenant: { code: string; name: string; generation: number; readOnly: boolean }; view: StockView | null;
  selected?: LedgerMovementView | null;
  materials: MaterialSummary[]; locations: NamedRecordView[]; units: string[]; locale: Locale; messages: Messages;
}) {
  const t = stockLabels(messages);
  const pickers = { material: materialPicker(messages.lists), location: recordPicker(messages.lists, "location") };
  const path = `/admin/${tenant.code}`;
  const types: Record<string, string> = { reversal: t.reversal.type, correction: t.correction, "goods-receipt": t.goodsReceipt, "transfer-dispatch": t.transferDispatch, "transfer-receipt": t.transferReceipt, "goods-issue": t.goodsIssue, "production-completion": t.productionCompletion };
  const records: Record<string, string> = t.records;
  // A narrow screen scrolls the ledger sideways rather than squeezing a column to one character.
  const columns: DataTableColumn<LedgerMovementView>[] = [
    { id: "date", header: t.date, kind: "date", cell: (row) => row.businessDate },
    { id: "type", header: t.type, kind: "text", cell: (row) => types[row.type] ?? row.type },
    { id: "quantity", header: t.movement, kind: "quantity", cell: (row) => `${row.quantity.startsWith("-") ? "" : "+"}${shownQuantity(row.quantity)} ${row.baseUnit}` },
    { id: "source", header: t.source, kind: "longText", priority: 2, cell: ({ type, source }) => source.document === null ? (type === "correction" ? <span className="text-muted-foreground">{t.ownSource}</span> : <span aria-label="none" className="text-muted-foreground">—</span>) : <div className="flex min-w-0 flex-col gap-1">
      <Link href={`${path}/${DOCUMENT_SECTIONS[source.document.type]}/${source.document.id}`} className="underline underline-offset-4">{fill(t.documents[source.document.type], { id: source.document.id })}</Link>
      {type in records && <span className="text-xs text-muted-foreground">{fill(records[type], { id: source.id! })}</span>}
    </div> },
    { id: "reason", header: t.reason, kind: "longText", cell: (row) => <div className="flex min-w-0 flex-col gap-2">
      <span>{row.reason}</span>
      <span className="text-xs text-muted-foreground">{row.actorUsername} · {t.channels[row.channel]}</span>
      <details className="text-xs"><summary className="cursor-pointer">{t.details}</summary>
        <p>{t.posting}: {row.postingId}</p>
        <p>{t.entered}: {shownQuantity(row.enteredQuantity)} {row.enteredUnit} · {t.factor}: {row.numerator}/{row.denominator}</p>
        <p>{t.after}: {shownQuantity(row.balanceAfter)} {row.baseUnit}</p>
      </details>
    </div> },
    { id: "reversal", header: t.reversal.type, kind: "text", className: "whitespace-normal", cell: (row) => <ReversalControls tenant={tenant} movement={{ ...row, sourceLabel: `${types[row.type] ?? row.type}${row.source.id === null ? "" : ` ${row.source.id}`} · ${fill(t.reversal.line, { line: String(row.position + 1) })}` }} reversedBy={row.reversedBy} reverses={row.reverses} canReverse={row.canReverse} labels={t} /> },
  ];
  const editable = view !== null && !tenant.readOnly && view.materialActive && view.locationActive;
  return <div lang={locale} className="min-w-0">
    <PageHeader
      title={fill(t.heading, { tenant: tenant.name })}
      description={<>{t.intro} <Link href={`${path}/reports/stock`} className="underline underline-offset-4">{t.report}</Link></>}
      actions={!tenant.readOnly && <ImportLink tenant={tenant.code} label={messages.stockImport.link} section="stock-import" />}
    />
    <div className="flex min-w-0 flex-col gap-8">
      {view === null ? <EmptyState title={t.noMasters} /> : <>
        <form action={`${path}/stock`} className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {/* Keyed by the pair shown, so a navigation to another pair starts the fields afresh (#222). */}
          <div className="grid min-w-0 gap-2"><Label id="stock-material-label" htmlFor="stock-material">{t.material}</Label>
            <FilterAutocomplete key={view.material} id="stock-material" name="material" options={materialFilterOptions(materials, t.inactive)} defaultValue={view.material}
              labels={pickers.material.labels} placeholder={pickers.material.placeholder} locale={locale} aria-labelledby="stock-material-label" />
          </div>
          <div className="grid min-w-0 gap-2"><Label id="stock-location-label" htmlFor="stock-location">{t.location}</Label>
            <FilterAutocomplete key={view.location} id="stock-location" name="location" options={recordOptions(locations, t.inactive)} defaultValue={view.location}
              labels={pickers.location.labels} placeholder={pickers.location.placeholder} locale={locale} aria-labelledby="stock-location-label" />
          </div><Button type="submit" variant="outline">{t.show}</Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div><h2 className="text-sm text-muted-foreground">{t.quantity}</h2><p className="text-2xl font-semibold tabular-nums" data-stock-balance>{shownQuantity(view.quantity)} {view.baseUnit}</p></div>
            <div><h2 className="text-sm text-muted-foreground">{t.inTransitFrom}</h2><p className="text-lg tabular-nums" data-stock-transit-from>{shownQuantity(view.inTransitFrom)} {view.baseUnit}</p></div>
            <div><h2 className="text-sm text-muted-foreground">{t.inTransitTo}</h2><p className="text-lg tabular-nums" data-stock-transit-to>{shownQuantity(view.inTransitTo)} {view.baseUnit}</p></div>
            <p className="basis-full text-xs text-muted-foreground">{t.transitNote} <Link href={`${path}/transfers`} className="underline underline-offset-4">{t.transfers}</Link>
              {view.transitTransfers.map((id) => <span key={id}> · <Link href={`${path}/transfers/${id}`} className="font-mono underline underline-offset-4">{id}</Link></span>)}</p>
          </div>
          {editable ? <CorrectionDialog context={{ tenant: tenant.code, generation: tenant.generation }} pair={{ material: view.material, location: view.location }} units={units} labels={t} /> : <p className="text-sm text-muted-foreground">{t.unavailable}</p>}
        </div>
        {selected !== null && <section className="flex min-w-0 flex-col gap-3 rounded-lg border p-4" aria-label={t.reversal.selected}>
          <h2 className="text-lg font-semibold">{t.reversal.selected}</h2>
          <DataTable label={t.reversal.selected} columns={columns} rows={[selected]} rowKey={(row) => row.id} empty={t.empty} />
        </section>}
        <section className="flex min-w-0 flex-col gap-3"><h2 className="text-lg font-semibold">{t.ledger}</h2><p className="text-xs text-muted-foreground">{t.recent}</p>
          <DataTable label={t.ledger} columns={columns} rows={view.movements} rowKey={(row) => row.id} empty={t.empty} pagination={
            <PageLinks page={view.page} pages={Math.ceil(view.movementCount / STOCK_LEDGER_PAGE_SIZE)} labels={t}
              href={(page) => `${path}/stock?${new URLSearchParams({ material: view.material, location: view.location, page: String(page) })}`} />
          } />
        </section>
      </>}
    </div>
  </div>;
}
