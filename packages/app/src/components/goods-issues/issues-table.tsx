import type { IssueView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, shownQuantity, type IssuesLabels } from "./labels";

import type { StockLabels } from "../stock/labels";
import { ReversalControls } from "../stock/reversal-controls";

interface IssuesTableProps {
  tenant: { code: string; generation: number; readOnly: boolean };
  reversalLabels: StockLabels;
  issues: IssueView[];
  materials: MaterialsById;
  labels: IssuesLabels;
}

/** One shipment's goods issues, newest first: ID, business date and what each line issued, in the base unit. */
export function IssuesTable({ issues, materials, labels, tenant, reversalLabels }: IssuesTableProps) {
  const c = labels.columns;
  const columns: DataTableColumn<IssueView>[] = [
    { id: "id", header: c.id, kind: "id", cell: (issue) => issue.id },
    { id: "date", header: c.date, kind: "date", cell: (issue) => issue.businessDate },
    {
      id: "lines",
      header: c.lines,
      kind: "longText",
      cell: (issue) => (
        <ul className="flex flex-col gap-1">
          {issue.lines.map(({ line, material, quantity, movementId, reversedBy }) => (
            <li key={line}>{fill(labels.lineSummary, { line: String(line), quantity: shownQuantity(quantity), baseUnit: materials.get(material)!.baseUnit })}{movementId !== null && <ReversalControls tenant={tenant} labels={reversalLabels} reverses={null} reversedBy={reversedBy} canReverse={reversedBy === null}
                movement={{ id: movementId, material, location: issue.location, quantity: `-${quantity}`, baseUnit: materials.get(material)!.baseUnit, businessDate: issue.businessDate,
                  sourceLabel: `${reversalLabels.goodsIssue} ${issue.id} · ${fill(reversalLabels.reversal.line, { line: String(line) })} · ${materials.get(material)!.description}` }} />}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <DataTable label={labels.heading} columns={columns} rows={issues} rowKey={(issue) => issue.id} empty={labels.empty} />;
}
