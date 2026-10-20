import Link from "next/link";
import type { RequisitionView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, shownQuantity, type LocationsById, type MaterialsById, type RequisitionsLabels } from "./labels";

interface RequisitionsTableProps {
  tenant: { code: string; name: string };
  requisitions: RequisitionView[];
  materials: MaterialsById;
  locations: LocationsById;
  labels: RequisitionsLabels;
  /** Everyone who may write also gets a hint on how to start. */
  editable: boolean;
}

/** A tenant's purchase requisitions by ID, with how much of each purchase orders have converted. */
export function RequisitionsTable({ tenant, requisitions, materials, locations, labels, editable }: RequisitionsTableProps) {
  const t = labels.columns;
  const amount = (quantity: string, material: string) => `${shownQuantity(quantity)} ${materials.get(material)!.baseUnit}`;
  const columns: DataTableColumn<RequisitionView>[] = [
    { id: "id", header: t.id, cell: (requisition) => <span className="font-mono">{requisition.id}</span> },
    {
      id: "material",
      header: t.material,
      cell: (requisition) => {
        const material = materials.get(requisition.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="font-mono underline underline-offset-4">
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
