import type { IssueView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, shownQuantity, type IssuesLabels } from "./labels";

interface IssuesTableProps {
  issues: IssueView[];
  materials: MaterialsById;
  labels: IssuesLabels;
}

/** One shipment's goods issues, newest first: ID, business date and what each line issued, in the base unit. */
export function IssuesTable({ issues, materials, labels }: IssuesTableProps) {
  const c = labels.columns;
  const columns: DataTableColumn<IssueView>[] = [
    { id: "id", header: c.id, cell: (issue) => <span className="font-mono">{issue.id}</span> },
    { id: "date", header: c.date, cell: (issue) => issue.businessDate },
    {
      id: "lines",
      header: c.lines,
      className: "whitespace-normal wrap-anywhere",
      cell: (issue) => (
        <ul className="flex flex-col gap-1">
          {issue.lines.map(({ line, material, quantity }) => (
            <li key={line}>{fill(labels.lineSummary, { line: String(line), quantity: shownQuantity(quantity), baseUnit: materials.get(material)!.baseUnit })}</li>
          ))}
        </ul>
      ),
    },
  ];
  return <DataTable label={labels.heading} columns={columns} rows={issues} rowKey={(issue) => issue.id} empty={labels.empty} />;
}
