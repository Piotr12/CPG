import type { PlanningParameterView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import type { PlanningParametersLabels } from "./labels";
import { PlanningParameterActions } from "./planning-parameter-actions";
import { LocationCell, MaterialCell, type ReferenceDetails } from "../master-data/references";

/** A set as the screen shows it: with its material's and location's details. */
export type PlanningParameterRow = PlanningParameterView & ReferenceDetails;

interface PlanningParametersTableProps {
  tenant: { code: string; name: string; generation: number };
  rows: PlanningParameterRow[];
  labels: PlanningParametersLabels;
  /** The admin's row menus and empty-state hint; a normal user (or a read-only tenant) gets neither. */
  editable: boolean;
}

/** A tenant's planning parameter sets by material, then location; quantities in each material's base unit. */
export function PlanningParametersTable({ tenant, rows, labels, editable }: PlanningParametersTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const quantity = (value: string, row: PlanningParameterRow) => `${shownQuantity(value)} ${row.baseUnit}`;
  const columns: DataTableColumn<PlanningParameterRow>[] = [
    {
      id: "material",
      header: t.material,
      cell: (row) => <MaterialCell tenant={tenant.code} row={row} inactive={labels.inactive} />,
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "location",
      header: t.location,
      cell: (row) => <LocationCell row={row} inactive={labels.inactive} />,
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "procurement",
      header: t.procurement,
      cell: (row) => (
        <Badge variant={row.procurement === "make" ? "default" : "outline"}>{labels.procurement[row.procurement]}</Badge>
      ),
    },
    { id: "leadTime", header: t.leadTime, cell: (row) => row.leadTimeDays, className: "text-right" },
    { id: "minimum", header: t.minimum, cell: (row) => quantity(row.minimumQuantity, row), className: "text-right" },
    { id: "multiple", header: t.multiple, cell: (row) => quantity(row.lotMultiple, row), className: "text-right" },
  ];

  return (
    <DataTable
      label={labels.link}
      actionsLabel={editable ? t.actions : undefined}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.material}/${row.location}`}
      rowActions={editable ? (row) => <PlanningParameterActions row={row} context={context} labels={labels} /> : undefined}
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
