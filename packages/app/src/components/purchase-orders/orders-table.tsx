import Link from "next/link";
import type { OrderView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { PurchaseOrderSort } from "@cpg/core/validators/purchasing/purchase-order-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { documentStatusTone, masterDataStatusTone, type DocumentStatus } from "../document-lifecycle/status-tone";
import type { Messages } from "../../i18n/messages/en";
import { PageLinks } from "../layout/page-links";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
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
  /** The list's search, marked in the ID, supplier and location cells (#217). */
  search: string;
  sort: { sort: PurchaseOrderSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/** A tenant's purchase orders, by ID unless sorted by a header (#217); each ID opens the order and its lines. */
export function OrdersTable({ tenant, orders, suppliers, locations, labels, page, pages, editable, search, sort, links, lists }: OrdersTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<OrderView>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      sortKey: "id",
      cell: (order) => (
        <Link href={`/admin/${tenant.code}/purchase-orders/${order.id}`} className="underline underline-offset-4">
          <Highlight text={order.id} query={search} />
        </Link>
      ),
    },
    {
      id: "supplier",
      header: t.supplier,
      kind: "longText",
      sortKey: "supplier",
      cell: (order) => {
        const supplier = suppliers.get(order.supplier)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">
              <Highlight text={supplier.id} query={search} />
            </span>
            <span>
              <Highlight text={supplier.name} query={search} />
            </span>
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
      sortKey: "location",
      cell: (order) => {
        const location = locations.get(order.location)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">
              <Highlight text={location.id} query={search} />
            </span>
            <span>
              <Highlight text={location.name} query={search} />
            </span>
          </span>
        );
      },
    },
    { id: "created", header: t.created, kind: "date", priority: 2, sortKey: "created", cell: (order) => order.createdAt.toISOString().slice(0, 10) },
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
      sortKey: "status",
      cell: (order) => <StatusBadge {...documentStatusTone(order.status as DocumentStatus)}>{labels.status[order.status as keyof typeof labels.status]}</StatusBadge>,
    },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      pagination={<PageLinks page={page} pages={pages} labels={labels} href={links.pageHref} />}
      empty={
        search ? <NoSearchResults links={links} query={search} lists={lists} /> : [fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")
      }
    />
  );
}
