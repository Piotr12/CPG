import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, TransferView } from "@cpg/core";
import { TRANSFER_PAGE_SIZE } from "@cpg/core/validators/transfers/transfer.schema";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { transferStatusTone } from "../document-lifecycle/status-tone";
import type { Messages } from "../../i18n/messages/en";
import { PageLinks } from "../layout/page-links";
import { activeOptions, materialChoices } from "../purchase-requisitions/choices";
import { CreateTransferDialog } from "./create-transfer-dialog";
import { byId, fill, locationName, materialName, shownQuantity, transfersLabels } from "./labels";

interface TransfersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  /** One page of transfers, and which page of how many transfers in all. */
  transfers: TransferView[];
  page: number;
  total: number;
  /** The tenant's materials and locations, for the rows and the form's choices, and each material's units. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Transfers page (E07-S03): heading, intro, Create transfer and a page of the list,
 * each row with its route, quantities and status. Any signed-in account may create, but not while
 * the tenant is read-only (R05).
 */
export function TransfersScreen({ tenant, transfers, page, total, materials, locations, units, locale, messages }: TransfersScreenProps) {
  const labels = transfersLabels(messages);
  const t = labels.columns;
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
      cell: (transfer) => (
        <Link href={`${path}/${transfer.id}`} className="underline underline-offset-4">
          {transfer.id}
        </Link>
      ),
    },
    { id: "material", header: t.material, kind: "longText", cell: (transfer) => materialName(materialsById, transfer.material) },
    {
      id: "route",
      header: t.route,
      kind: "longText",
      priority: 2,
      cell: (transfer) =>
        fill(labels.route, { source: locationName(locationsById, transfer.source), destination: locationName(locationsById, transfer.destination) }),
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
      cell: (transfer) => fill(labels.plannedDates, { dispatch: transfer.plannedDispatch, arrival: transfer.plannedArrival }),
    },
    {
      id: "status",
      header: t.status,
      kind: "status",
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
            materials={materialChoices(materials, units)}
            locations={activeOptions(locations)}
          />
        )}
      />
      <DataTable
        label={labels.link}
        columns={columns}
        rows={transfers}
        rowKey={(transfer) => transfer.id}
        pagination={<PageLinks page={page} pages={pages} labels={labels} href={(target) => `${path}?page=${target}`} />}
        empty={[fill(labels.empty, { tenant: tenant.name }), ...(tenant.readOnly ? [] : [labels.emptyHint])].join(" ")}
      />
    </div>
  );
}
