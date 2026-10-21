import { cancelRequisition, closeEarlyRequisition, setRequisitionRequiredDate } from "../../app/admin/[tenant]/purchase-requisitions/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import { ChangeDateDialog } from "../purchasing/change-date-dialog";
import Link from "next/link";
import type { RequisitionView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, shownQuantity, type LocationsById, type MaterialsById, type RequisitionsLabels } from "./labels";

interface RequisitionsTableProps {
  tenant: { code: string; name: string; generation: number };
  requisitions: RequisitionView[];
  materials: MaterialsById;
  locations: LocationsById;
  labels: RequisitionsLabels;
  /** Everyone who may write also gets a hint on how to start. */
  editable: boolean;
}

/**
 * A tenant's purchase requisitions by ID, with how much of each purchase orders have converted, and
 * an Open row's Change date and lifecycle actions while the tenant is writable.
 */
export function RequisitionsTable({ tenant, requisitions, materials, locations, labels, editable }: RequisitionsTableProps) {
  const t = labels.columns;
  const amount = (quantity: string, material: string) => `${shownQuantity(quantity)} ${materials.get(material)!.baseUnit}`;
  const dateLabels = { ...labels.changeDate, field: labels.form.requiredDate, cancel: labels.cancel, date: labels.fieldErrors.date };
  const columns: DataTableColumn<RequisitionView>[] = [
    { id: "id", header: t.id, cell: (requisition) => <span className="font-mono">{requisition.id}</span> },
    {
      id: "material",
      header: t.material,
      cell: (requisition) => {
        const material = materials.get(requisition.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="font-mono whitespace-nowrap underline underline-offset-4">
              {material.id}
            </Link>
            <span>{material.description}</span>
            {!material.active && <Badge variant="destructive">{labels.inactive}</Badge>}
          </span>
        );
      },
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "location",
      header: t.location,
      cell: (requisition) => {
        const location = locations.get(requisition.location)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{location.id}</span>
            <span>{location.name}</span>
          </span>
        );
      },
      className: "hidden whitespace-normal wrap-anywhere md:table-cell",
    },
    { id: "quantity", header: t.quantity, cell: (requisition) => amount(requisition.quantity, requisition.material), className: "text-right" },
    {
      id: "converted",
      header: t.converted,
      cell: (requisition) => amount(requisition.converted, requisition.material),
      className: "hidden text-right sm:table-cell",
    },
    {
      id: "outstanding",
      header: t.outstanding,
      cell: (requisition) => amount(requisition.outstanding, requisition.material),
      className: "hidden text-right sm:table-cell",
    },
    { id: "requiredDate", header: t.requiredDate, cell: (requisition) => requisition.requiredDate, className: "hidden sm:table-cell" },
    {
      id: "status",
      header: t.status,
      cell: (requisition) => (
        <Badge variant={requisition.status === "open" ? "secondary" : "outline"}>{labels.status[requisition.status as keyof typeof labels.status]}</Badge>
      ),
    },
    { id: "abandoned", header: labels.lifecycle.abandoned, cell: (row) => amount(row.abandoned, row.material), className: "text-right" },
    { id: "actions", header: labels.lifecycle.actions, cell: (row) => <div className="flex flex-col items-start gap-2">
      <ChangeDateDialog kind="requisition" available={editable && row.status === "open"} subject={`${labels.link} ${row.id}`} value={row.requiredDate}
        version={row.version} save={setRequisitionRequiredDate.bind(null, tenant.code, tenant.generation, row.id)} labels={dateLabels} errors={labels.errors} />
      <LifecycleControl available={editable && row.status === "open"} processed={row.converted !== "0.000000"}
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
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
