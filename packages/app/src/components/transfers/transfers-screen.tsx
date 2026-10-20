import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, TransferView } from "@cpg/core";
import { TRANSFER_PAGE_SIZE } from "@cpg/core/validators/transfers/transfer.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import type { Messages } from "../../i18n/messages/en";
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
      cell: (transfer) => (
        <Link href={`${path}/${transfer.id}`} className="font-mono underline underline-offset-4">
          {transfer.id}
        </Link>
      ),
    },
    { id: "material", header: t.material, cell: (transfer) => materialName(materialsById, transfer.material), className: "whitespace-normal wrap-anywhere" },
    {
      id: "route",
      header: t.route,
      cell: (transfer) =>
        fill(labels.route, { source: locationName(locationsById, transfer.source), destination: locationName(locationsById, transfer.destination) }),
      className: "hidden whitespace-normal wrap-anywhere md:table-cell",
    },
    { id: "quantity", header: t.quantity, cell: (transfer) => amount(transfer.quantity, transfer.material), className: "text-right" },
    { id: "dispatched", header: t.dispatched, cell: (transfer) => amount(transfer.dispatched, transfer.material), className: "hidden text-right sm:table-cell" },
    { id: "inTransit", header: t.inTransit, cell: (transfer) => amount(transfer.inTransit, transfer.material), className: "text-right" },
    { id: "received", header: t.received, cell: (transfer) => amount(transfer.received, transfer.material), className: "hidden text-right sm:table-cell" },
    {
      id: "plannedDates",
      header: t.plannedDates,
      cell: (transfer) => fill(labels.plannedDates, { dispatch: transfer.plannedDispatch, arrival: transfer.plannedArrival }),
      className: "hidden lg:table-cell",
    },
    {
      id: "status",
      header: t.status,
      cell: (transfer) => <Badge variant={transfer.status === "open" ? "secondary" : "outline"}>{labels.status[transfer.status]}</Badge>,
    },
  ];

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.transfers.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {!tenant.readOnly && (
          <CreateTransferDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialChoices(materials, units)}
            locations={activeOptions(locations)}
          />
        )}
      </div>
      <DataTable
        label={labels.link}
        columns={columns}
        rows={transfers}
        rowKey={(transfer) => transfer.id}
        pagination={
          pages > 1 && (
            <nav aria-label={labels.pagination} className="flex flex-wrap items-center justify-end gap-3">
              {page > 1 && (
                <Button asChild variant="outline">
                  <Link href={`${path}?page=${page - 1}`}>{labels.previous}</Link>
                </Button>
              )}
              <span className="text-sm">{fill(labels.page, { page: String(page), pages: String(pages) })}</span>
              {page < pages && (
                <Button asChild variant="outline">
                  <Link href={`${path}?page=${page + 1}`}>{labels.next}</Link>
                </Button>
              )}
            </nav>
          )
        }
        empty={[fill(labels.empty, { tenant: tenant.name }), ...(tenant.readOnly ? [] : [labels.emptyHint])].join(" ")}
      />
    </div>
  );
}
