import { cancelRequisition, closeEarlyRequisition, setRequisitionRequiredDate } from "../../app/admin/[tenant]/purchase-requisitions/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import { ChangeDateDialog } from "../purchasing/change-date-dialog";
import Link from "next/link";
import type { RequisitionView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { RequisitionSort } from "@cpg/core/validators/purchasing/purchase-requisition-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { documentStatusTone, masterDataStatusTone, type DocumentStatus } from "../document-lifecycle/status-tone";
import type { Messages } from "../../i18n/messages/en";
import { PageLinks } from "../layout/page-links";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { fill, shownQuantity, type LocationsById, type MaterialsById, type RequisitionsLabels } from "./labels";

interface RequisitionsTableProps {
  tenant: { code: string; name: string; generation: number };
  requisitions: RequisitionView[];
  materials: MaterialsById;
  locations: LocationsById;
  labels: RequisitionsLabels;
  /** The 1-based page shown and how many pages the tenant's requisitions make. */
  page: number;
  pages: number;
  /** Everyone who may write also gets a hint on how to start. */
  editable: boolean;
  /** The list's search, marked in the ID, material and location cells (#217). */
  search: string;
  sort: { sort: RequisitionSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/**
 * A tenant's purchase requisitions, by ID unless sorted by a header (#217), with how much of each purchase orders have converted, and
 * an Open row's Change date and lifecycle actions while the tenant is writable.
 */
export function RequisitionsTable({ tenant, requisitions, materials, locations, labels, page, pages, editable, search, sort, links, lists }: RequisitionsTableProps) {
  const t = labels.columns;
  const amount = (quantity: string, material: string) => `${shownQuantity(quantity)} ${materials.get(material)!.baseUnit}`;
  const dateLabels = { ...labels.changeDate, field: labels.form.requiredDate, cancel: labels.cancel, date: labels.fieldErrors.date };
  const columns: DataTableColumn<RequisitionView>[] = [
    { id: "id", header: t.id, kind: "id", sortKey: "id", cell: (requisition) => <Highlight text={requisition.id} query={search} /> },
    {
      id: "material",
      header: t.material,
      kind: "longText",
      sortKey: "material",
      cell: (requisition) => {
        const material = materials.get(requisition.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="font-mono whitespace-nowrap underline underline-offset-4">
              <Highlight text={material.id} query={search} />
            </Link>
            <span>
              <Highlight text={material.description} query={search} />
            </span>
            {!material.active && <StatusBadge {...masterDataStatusTone(false)}>{labels.inactive}</StatusBadge>}
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
      cell: (requisition) => {
        const location = locations.get(requisition.location)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono whitespace-nowrap">
              <Highlight text={location.id} query={search} />
            </span>
            <span>
              <Highlight text={location.name} query={search} />
            </span>
          </span>
        );
      },
    },
    { id: "quantity", header: t.quantity, kind: "quantity", sortKey: "quantity", cell: (requisition) => amount(requisition.quantity, requisition.material) },
    { id: "converted", header: t.converted, kind: "quantity", priority: 2, sortKey: "converted", cell: (requisition) => amount(requisition.converted, requisition.material) },
    { id: "outstanding", header: t.outstanding, kind: "quantity", priority: 2, cell: (requisition) => amount(requisition.outstanding, requisition.material) },
    { id: "requiredDate", header: t.requiredDate, kind: "date", priority: 2, sortKey: "requiredDate", cell: (requisition) => requisition.requiredDate },
    {
      id: "status",
      header: t.status,
      kind: "status",
      sortKey: "status",
      cell: (requisition) => (
        <StatusBadge {...documentStatusTone(requisition.status as DocumentStatus)}>{labels.status[requisition.status as keyof typeof labels.status]}</StatusBadge>
      ),
    },
    { id: "abandoned", header: labels.lifecycle.abandoned, kind: "quantity", priority: 2, sortKey: "abandoned", cell: (row) => amount(row.abandoned, row.material) },
    { id: "actions", header: labels.lifecycle.actions, kind: "actions", cell: (row) => <div className="flex flex-col items-start gap-2">
      <ChangeDateDialog kind="requisition" available={editable && row.status === "open"} subject={`${labels.link} ${row.id}`} value={row.requiredDate}
        version={row.version} save={setRequisitionRequiredDate.bind(null, tenant.code, tenant.generation, row.id)} labels={dateLabels} errors={labels.errors} />
      <LifecycleControl kind="requisition" available={editable && row.status === "open"} processed={row.converted !== "0.000000"}
        subject={`${labels.link} ${row.id}`} version={row.version} quantities={[amount(row.outstanding, row.material)]}
        labels={labels.lifecycle} errors={labels.errors}
        cancel={cancelRequisition.bind(null, tenant.code, tenant.generation, row.id)} closeEarly={closeEarlyRequisition.bind(null, tenant.code, tenant.generation, row.id)} />
    </div> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={requisitions}
      rowKey={(requisition) => requisition.id}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      pagination={<PageLinks page={page} pages={pages} labels={labels} href={links.pageHref} />}
      empty={
        search ? <NoSearchResults links={links} query={search} lists={lists} /> : [fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")
      }
    />
  );
}
