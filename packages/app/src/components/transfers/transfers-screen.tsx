import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Locale, MaterialSummary, NamedRecordView, TransferView } from "@cpg/core";
import type { TransferSort } from "@cpg/core/validators/transfers/transfer-list.schema";
import { TRANSFER_PAGE_SIZE } from "@cpg/core/validators/transfers/transfer.schema";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { transferStatusTone } from "../document-lifecycle/status-tone";
import type { Messages } from "../../i18n/messages/en";
import { PageLinks } from "../layout/page-links";
import { ListSearchBar, NoSearchResults } from "../lists/list-search-bar";
import { activeOptions, materialPicks } from "../purchase-requisitions/choices";
import type { DocumentListState } from "../purchasing/list-state";
import { CreateTransferDialog } from "./create-transfer-dialog";
import { byId, fill, locationName, materialName, shownQuantity, transfersLabels } from "./labels";

interface TransfersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  /** One page of transfers, and which page of how many transfers in all. */
  transfers: TransferView[];
  page: number;
  total: number;
  /** The list's search and sort (#217); `total` is what the search found. */
  list: Omit<DocumentListState<TransferSort>, "count">;
  /** The tenant's materials and locations, for the rows and the form's choices, and each material's units. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Transfers page (E07-S03): heading, intro, Create transfer, the search box and a
 * page of the list, sortable by its headers (#217), each row with its route, quantities and status. Any signed-in account may create, but not while
 * the tenant is read-only (R05).
 */
export function TransfersScreen({ tenant, transfers, page, total, list, materials, locations, units, locale, messages }: TransfersScreenProps) {
  const labels = transfersLabels(messages);
  const t = labels.columns;
  const search = list.search.q;
  const path = `/admin/${tenant.code}/transfers`;
  const pages = Math.ceil(total / TRANSFER_PAGE_SIZE);
  const materialsById = byId(materials);
  const locationsById = byId(locations);
  const amount = (quantity: string, material: string) => `${shownQuantity(quantity)} ${materialsById.get(material)!.baseUnit}`;
  const columns: DataTableColumn<TransferView>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      sortKey: "id",
      cell: (transfer) => (
        <Link href={`${path}/${transfer.id}`} className="underline underline-offset-4">
          <Highlight text={transfer.id} query={search} />
        </Link>
      ),
    },
    {
      id: "material",
      header: t.material,
      kind: "longText",
      sortKey: "material",
      cell: (transfer) => <Highlight text={materialName(materialsById, transfer.material)} query={search} />,
    },
    {
      id: "route",
      header: t.route,
      kind: "longText",
      priority: 2,
      sortKey: "source",
      cell: (transfer) =>
        fillNodes(labels.route, {
          source: <Highlight text={locationName(locationsById, transfer.source)} query={search} />,
          destination: <Highlight text={locationName(locationsById, transfer.destination)} query={search} />,
        }),
    },
    { id: "quantity", header: t.quantity, kind: "quantity", cell: (transfer) => amount(transfer.quantity, transfer.material) },
    { id: "dispatched", header: t.dispatched, kind: "quantity", priority: 2, cell: (transfer) => amount(transfer.dispatched, transfer.material) },
    { id: "inTransit", header: t.inTransit, kind: "quantity", cell: (transfer) => amount(transfer.inTransit, transfer.material) },
    { id: "received", header: t.received, kind: "quantity", priority: 2, cell: (transfer) => amount(transfer.received, transfer.material) },
    {
      id: "plannedDates",
      header: t.plannedDates,
      kind: "text",
      priority: 3,
      sortKey: "plannedDispatch",
      cell: (transfer) => fill(labels.plannedDates, { dispatch: transfer.plannedDispatch, arrival: transfer.plannedArrival }),
    },
    {
      id: "status",
      header: t.status,
      kind: "status",
      sortKey: "status",
      cell: (transfer) => <StatusBadge {...transferStatusTone(transfer.status)}>{labels.status[transfer.status]}</StatusBadge>,
    },
  ];

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.transfers.heading(tenant.name)}
        description={labels.intro}
        actions={!tenant.readOnly && (
          <CreateTransferDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialPicks(materials, units)}
            locations={activeOptions(locations)}
            locale={locale}
          />
        )}
      />
      <ListSearchBar links={list.links} search={list.search} labels={labels.search} lists={messages.lists} locale={locale} count={total} />
      <DataTable
        label={labels.link}
        columns={columns}
        rows={transfers}
        rowKey={(transfer) => transfer.id}
        sort={{ key: list.sort.sort, dir: list.sort.dir, href: list.links.sortHref, link: Link }}
        pagination={<PageLinks page={page} pages={pages} labels={labels} href={list.links.pageHref} />}
        empty={
          search ? (
            <NoSearchResults links={list.links} query={search} lists={messages.lists} />
          ) : (
            [fill(labels.empty, { tenant: tenant.name }), ...(tenant.readOnly ? [] : [labels.emptyHint])].join(" ")
          )
        }
      />
    </div>
  );
}

/** `template` with each `{name}` replaced by a node, so a filled label can hold marked text. */
function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/\{(\w+)\}/).map((part, index) => (index % 2 === 1 ? <Fragment key={index}>{values[part]}</Fragment> : part));
}
