import type { NamedRecordView, TransferLegView, TransferPostingView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { fill, locationName, shownQuantity, type TransfersLabels } from "./labels";

/** One leg of one posting: a row of the ledger. The posting's own details show on its first leg only. */
interface LedgerRow {
  key: string;
  posting: TransferPostingView;
  leg: TransferLegView;
  first: boolean;
}

interface LedgerTableProps {
  postings: TransferPostingView[];
  locations: Map<string, NamedRecordView>;
  baseUnit: string;
  labels: TransfersLabels;
}

/**
 * The transfer's ledger (TRF-024): each posting, newest first, as its legs in the order the goods move
 * — off the source into transit, out of transit onto the destination — with the signed change and the
 * balance after it. Postings are never changed, so the table has no actions.
 */
export function LedgerTable({ postings, locations, baseUnit, labels }: LedgerTableProps) {
  const t = labels.ledger;
  const rows: LedgerRow[] = postings.flatMap((posting) => posting.legs.map((leg, index) => ({ key: `${posting.id}-${index}`, posting, leg, first: index === 0 })));
  const amount = (quantity: string) => `${shownQuantity(quantity)} ${baseUnit}`;
  const columns: DataTableColumn<LedgerRow>[] = [
    { id: "date", header: t.columns.date, cell: (row) => (row.first ? row.posting.businessDate : "") },
    { id: "posting", header: t.columns.posting, cell: (row) => (row.first ? t.kinds[row.posting.kind] : "") },
    {
      id: "place",
      header: t.columns.place,
      cell: ({ leg }) => (leg.location === null ? t.places.transit : fill(t.places[leg.place as "source" | "destination"], { location: locationName(locations, leg.location) })),
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "change",
      header: t.columns.change,
      cell: ({ leg }) => `${leg.quantity.startsWith("-") ? "" : "+"}${amount(leg.quantity)}`,
      className: "text-right font-mono",
    },
    { id: "after", header: t.columns.after, cell: ({ leg }) => amount(leg.after), className: "hidden text-right sm:table-cell" },
    {
      id: "reason",
      header: t.columns.reason,
      cell: ({ posting, first }) =>
        first && (
          <div className="flex min-w-0 flex-col gap-1">
            <span>{posting.reason}</span>
            <span className="text-xs text-muted-foreground">
              {fill(t.by, { actor: posting.actorUsername, channel: t.channels[posting.channel] })} ·{" "}
              {fill(t.entered, { quantity: shownQuantity(posting.enteredQuantity), unit: posting.enteredUnit })}
            </span>
          </div>
        ),
      className: "whitespace-normal wrap-anywhere",
    },
  ];
  return <DataTable label={t.heading} columns={columns} rows={rows} rowKey={(row) => row.key} empty={t.empty} />;
}
