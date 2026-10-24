import type { ReceiptView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, shownQuantity, type ReceiptsLabels } from "./labels";

import type { StockLabels } from "../stock/labels";
import { ReversalControls } from "../stock/reversal-controls";

interface ReceiptsTableProps {
  tenant: { code: string; generation: number; readOnly: boolean };
  reversalLabels: StockLabels;
  receipts: ReceiptView[];
  materials: MaterialsById;
  labels: ReceiptsLabels;
}

/** One order's goods receipts, newest first: ID, business date and what each line received, in the base unit. */
export function ReceiptsTable({ receipts, materials, labels, tenant, reversalLabels }: ReceiptsTableProps) {
  const c = labels.columns;
  const columns: DataTableColumn<ReceiptView>[] = [
    { id: "id", header: c.id, kind: "id", cell: (receipt) => receipt.id },
    { id: "date", header: c.date, kind: "date", cell: (receipt) => receipt.businessDate },
    {
      id: "lines",
      header: c.lines,
      kind: "longText",
      cell: (receipt) => (
        <ul className="flex flex-col gap-1">
          {receipt.lines.map(({ line, material, quantity, movementId, reversedBy }) => (
            <li key={line}>
              {fill(labels.lineSummary, { line: String(line), quantity: shownQuantity(quantity), baseUnit: materials.get(material)!.baseUnit })}
            {movementId !== null && <ReversalControls tenant={tenant} labels={reversalLabels} reverses={null} reversedBy={reversedBy} canReverse={reversedBy === null}
                movement={{ id: movementId, material, location: receipt.location, quantity: quantity, baseUnit: materials.get(material)!.baseUnit, businessDate: receipt.businessDate,
                  sourceLabel: `${reversalLabels.goodsReceipt} ${receipt.id} · ${fill(reversalLabels.reversal.line, { line: String(line) })} · ${materials.get(material)!.description}` }} />}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <DataTable label={labels.heading} columns={columns} rows={receipts} rowKey={(receipt) => receipt.id} empty={labels.empty} />;
}
