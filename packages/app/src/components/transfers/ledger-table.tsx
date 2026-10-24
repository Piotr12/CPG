import type { NamedRecordView, TransferLegView, TransferPostingView, TransferReversalView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { reversalStatusTone } from "../document-lifecycle/status-tone";
import { fill, locationName, shownQuantity, type TenantContext, type TransfersLabels } from "./labels";
import { TransferReversalDialog } from "./transfer-reversal-dialog";

/** A posting or a reversal of one, as one entry of the ledger. */
type Entry = { posting: TransferPostingView; reversal?: undefined } | { reversal: TransferReversalView; posting?: undefined };

/** One leg of one entry: a row of the ledger. The entry's own details show on its first leg only. */
interface LedgerRow {
  key: string;
  entry: Entry;
  leg: TransferLegView;
  first: boolean;
}

interface LedgerTableProps {
  postings: TransferPostingView[];
  reversals: TransferReversalView[];
  locations: Map<string, NamedRecordView>;
  baseUnit: string;
  labels: TransfersLabels;
  /** The transfer a writable tenant may reverse postings of (E11-S03); without it the ledger has no actions. */
  reversible?: { context: TenantContext; transfer: string; path: string };
}

/**
 * The transfer's ledger (TRF-024): each posting and each reversal of one, newest first, as its legs in
 * the order the goods move, with the signed change and the balance after it. Postings are never
 * changed: a mistaken one is reversed in full (E11-S03), and both stay in the ledger, linked.
 */
export function LedgerTable({ postings, reversals, locations, baseUnit, labels, reversible }: LedgerTableProps) {
  const t = labels.ledger;
  const entries: Entry[] = [...postings.map((posting) => ({ posting })), ...reversals.map((reversal) => ({ reversal }))];
  const occurred = (entry: Entry) => (entry.posting ?? entry.reversal).occurredAt.getTime();
  entries.sort((a, b) => occurred(b) - occurred(a));
  const rows: LedgerRow[] = entries.flatMap((entry) => {
    const { id, legs } = entry.posting ?? entry.reversal;
    return legs.map((leg, index) => ({ key: `${id}-${index}`, entry, leg, first: index === 0 }));
  });
  const amount = (quantity: string) => `${shownQuantity(quantity)} ${baseUnit}`;
  const signed = (quantity: string) => `${quantity.startsWith("-") ? "" : "+"}${amount(quantity)}`;
  const place = (leg: TransferLegView) => (leg.location === null ? t.places.transit : fill(t.places[leg.place as "source" | "destination"], { location: locationName(locations, leg.location) }));
  const today = new Date().toISOString().slice(0, 10);
  const originals = new Map(postings.map((posting) => [posting.id, posting]));
  const columns: DataTableColumn<LedgerRow>[] = [
    { id: "date", header: t.columns.date, kind: "date", cell: (row) => (row.first ? (row.entry.posting ?? row.entry.reversal).businessDate : "") },
    {
      id: "posting",
      header: t.columns.posting,
      kind: "text",
      cell: ({ entry, first }) => first && (entry.posting ? t.kinds[entry.posting.kind] : t.reversalKinds[entry.reversal.kind]),
    },
    { id: "place", header: t.columns.place, kind: "longText", cell: ({ leg }) => place(leg) },
    { id: "change", header: t.columns.change, kind: "quantity", cell: ({ leg }) => signed(leg.quantity) },
    { id: "after", header: t.columns.after, kind: "quantity", priority: 2, cell: ({ leg }) => amount(leg.after) },
    {
      id: "reason",
      header: t.columns.reason,
      kind: "longText",
      cell: ({ entry, first }) => {
        if (!first) return null;
        const { reason, actorUsername, channel } = entry.posting ?? entry.reversal;
        const detail = entry.posting
          ? fill(t.entered, { quantity: shownQuantity(entry.posting.enteredQuantity), unit: entry.posting.enteredUnit })
          : fill(t.reverses, { date: originals.get(entry.reversal.original)!.businessDate });
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <span>{reason}</span>
            <span className="text-xs text-muted-foreground">{fill(t.by, { actor: actorUsername, channel: t.channels[channel] })} · {detail}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: t.actions,
      kind: "actions",
      cell: ({ entry, first }) => {
        const { posting } = entry;
        if (!first || !posting) return null;
        if (posting.reversedBy !== null) return <StatusBadge {...reversalStatusTone("reversed")}>{t.reversed}</StatusBadge>;
        if (!reversible) return null;
        if (!posting.canReverse) return <span className="text-xs text-muted-foreground">{t.blocked}</span>;
        // The reversal runs the other way, so each leg's sign flips and the goods move back in reverse order.
        const changes = [...posting.legs].reverse().map((leg) => ({ place: place(leg), quantity: signed(leg.quantity.startsWith("-") ? leg.quantity.slice(1) : `-${leg.quantity}`) }));
        return <TransferReversalDialog context={reversible.context} transfer={reversible.transfer} today={today} existingHref={reversible.path} labels={labels}
          posting={{ id: posting.id, kind: posting.kind, businessDate: posting.businessDate, changes }} />;
      },
    },
  ];
  return <DataTable label={t.heading} columns={columns} rows={rows} rowKey={(row) => row.key} empty={t.empty} />;
}
