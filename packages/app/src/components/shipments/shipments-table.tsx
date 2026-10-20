import Link from "next/link";
import type { ShipmentView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, shownQuantity, type ShipmentsLabels } from "./labels";

interface ShipmentsTableProps {
  tenant: string;
  shipments: ShipmentView[];
  materials: MaterialsById;
  labels: ShipmentsLabels;
}

/** One order's shipments, newest first: ID (to its page), planned date, status, and what each line has issued of its plan. */
export function ShipmentsTable({ tenant, shipments, materials, labels }: ShipmentsTableProps) {
  const c = labels.columns;
  const columns: DataTableColumn<ShipmentView>[] = [
    {
      id: "id",
      header: c.id,
      cell: (shipment) => (
        <Link className="font-mono underline underline-offset-4" href={`/admin/${tenant}/shipments/${shipment.id}`}>
          {shipment.id}
        </Link>
      ),
    },
    { id: "date", header: c.plannedDate, cell: (shipment) => shipment.plannedDate },
    { id: "status", header: c.status, cell: (shipment) => <Badge variant="secondary">{labels.states[shipment.status]}</Badge> },
    {
      id: "lines",
      header: c.lines,
      className: "hidden whitespace-normal wrap-anywhere sm:table-cell",
      cell: (shipment) => (
        <ul className="flex flex-col gap-1">
          {shipment.lines.map(({ line, material, quantity, issued }) => (
            <li key={line}>
              {fill(labels.lineSummary, { line: String(line), issued: shownQuantity(issued), quantity: shownQuantity(quantity), baseUnit: materials.get(material)!.baseUnit })}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <DataTable label={labels.heading} columns={columns} rows={shipments} rowKey={(shipment) => shipment.id} empty={labels.empty} />;
}
