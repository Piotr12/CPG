import type { PlanningParameterView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { shownQuantity, type TenantContext } from "../forms/form-labels";
import { EmptyText } from "../master-data/empty-text";
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
      kind: "longText",
      cell: (row) => <MaterialCell tenant={tenant.code} row={row} inactive={labels.inactive} />,
    },
    {
      id: "location",
      header: t.location,
      kind: "longText",
      cell: (row) => <LocationCell row={row} inactive={labels.inactive} />,
    },
    {
      id: "procurement",
      header: t.procurement,
      kind: "text",
      // A category, not a state: a tag, Make filled and Buy outlined.
      cell: (row) => (
        <Badge variant={row.procurement === "make" ? "secondary" : "outline"}>{labels.procurement[row.procurement]}</Badge>
      ),
    },
    { id: "leadTime", header: t.leadTime, kind: "quantity", cell: (row) => row.leadTimeDays },
    { id: "minimum", header: t.minimum, kind: "quantity", priority: 2, cell: (row) => quantity(row.minimumQuantity, row) },
    { id: "multiple", header: t.multiple, kind: "quantity", priority: 2, cell: (row) => quantity(row.lotMultiple, row) },
  ];

  return (
    <DataTable
      label={labels.link}
      actionsLabel={editable ? t.actions : undefined}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.material}/${row.location}`}
      rowActions={editable ? (row) => <PlanningParameterActions row={row} context={context} labels={labels} /> : undefined}
      empty={<EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
