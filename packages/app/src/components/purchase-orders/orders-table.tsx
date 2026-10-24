import Link from "next/link";
import type { OrderView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { documentStatusTone, masterDataStatusTone, type DocumentStatus } from "../document-lifecycle/status-tone";
import { PageLinks } from "../layout/page-links";
import { fill, type OrdersLabels, type PartiesById } from "./labels";

interface OrdersTableProps {
  tenant: { code: string; name: string };
  orders: OrderView[];
  suppliers: PartiesById;
  locations: PartiesById;
  labels: OrdersLabels;
  /** The 1-based page shown and how many pages the tenant's orders make. */
  page: number;
  pages: number;
  /** Everyone who may write also gets a hint on how to start. */
  editable: boolean;
}

/** A tenant's purchase orders by ID; each ID opens the order and its lines. */
export function OrdersTable({ tenant, orders, suppliers, locations, labels, page, pages, editable }: OrdersTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<OrderView>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      cell: (order) => (
        <Link href={`/admin/${tenant.code}/purchase-orders/${order.id}`} className="underline underline-offset-4">
          {order.id}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: t.supplier,
      kind: "longText",
      cell: (order) => {
        const supplier = suppliers.get(order.supplier)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{supplier.id}</span>
            <span>{supplier.name}</span>
            {!supplier.active && <StatusBadge {...masterDataStatusTone(false)}>{labels.inactive}</StatusBadge>}
          </span>
        );
      },
    },
    {
      id: "location",
      header: t.location,
      kind: "longText",
      priority: 2,
      cell: (order) => {
        const location = locations.get(order.location)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{location.id}</span>
            <span>{location.name}</span>
          </span>
        );
      },
    },
    {
      id: "lines",
      header: t.lines,
      kind: "text",
      priority: 2,
      cell: (order) => (order.lines.length === 1 ? labels.lines.summaryOne : fill(labels.lines.summary, { count: String(order.lines.length) })),
    },
    {
      id: "status",
      header: t.status,
      kind: "status",
      cell: (order) => <StatusBadge {...documentStatusTone(order.status as DocumentStatus)}>{labels.status[order.status as keyof typeof labels.status]}</StatusBadge>,
    },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
      pagination={<PageLinks page={page} pages={pages} labels={labels} href={(target) => `/admin/${tenant.code}/purchase-orders?page=${target}`} />}
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
