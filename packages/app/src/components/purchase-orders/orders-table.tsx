import Link from "next/link";
import type { OrderView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, type OrdersLabels, type PartiesById } from "./labels";

interface OrdersTableProps {
  tenant: { code: string; name: string };
  orders: OrderView[];
  suppliers: PartiesById;
  locations: PartiesById;
  labels: OrdersLabels;
  /** Everyone who may write also gets a hint on how to start. */
  editable: boolean;
}

/** A tenant's purchase orders by ID; each ID opens the order and its lines. */
export function OrdersTable({ tenant, orders, suppliers, locations, labels, editable }: OrdersTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<OrderView>[] = [
    {
      id: "id",
      header: t.id,
      cell: (order) => (
        <Link href={`/admin/${tenant.code}/purchase-orders/${order.id}`} className="font-mono underline underline-offset-4">
          {order.id}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: t.supplier,
      cell: (order) => {
        const supplier = suppliers.get(order.supplier)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{supplier.id}</span>
            <span>{supplier.name}</span>
            {!supplier.active && <Badge variant="destructive">{labels.inactive}</Badge>}
          </span>
        );
      },
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "location",
      header: t.location,
      cell: (order) => {
        const location = locations.get(order.location)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{location.id}</span>
            <span>{location.name}</span>
          </span>
        );
      },
      className: "hidden whitespace-normal wrap-anywhere md:table-cell",
    },
    {
      id: "lines",
      header: t.lines,
      cell: (order) => (order.lines.length === 1 ? labels.lines.summaryOne : fill(labels.lines.summary, { count: String(order.lines.length) })),
      className: "hidden sm:table-cell",
    },
    { id: "status", header: t.status, cell: (order) => <Badge variant="secondary">{labels.status[order.status as keyof typeof labels.status]}</Badge> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
