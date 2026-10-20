import type { SafetyStockTargetView, TargetStatus } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { LocationCell, MaterialCell, type ReferenceDetails } from "../master-data/references";
import type { SafetyStockLabels } from "./labels";
import { SafetyStockTargetActions } from "./safety-stock-target-actions";

/** A target as the screen shows it: with its material's and location's details, and where it stands today. */
export type SafetyStockRow = SafetyStockTargetView & ReferenceDetails & { status: TargetStatus };

interface SafetyStockTableProps {
  tenant: { code: string; name: string; generation: number };
  rows: SafetyStockRow[];
  labels: SafetyStockLabels;
  /** The admin's row menus and empty-state hint; a normal user (or a read-only tenant) gets neither. */
  editable: boolean;
}

/** A tenant's safety-stock targets by material, location, then date, each with its status today (DEM-015, DEM-016). */
export function SafetyStockTable({ tenant, rows, labels, editable }: SafetyStockTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<SafetyStockRow>[] = [
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
    { id: "effectiveFrom", header: t.effectiveFrom, cell: (row) => <span className="font-mono">{row.effectiveFrom}</span> },
    { id: "quantity", header: t.quantity, cell: (row) => `${shownQuantity(row.quantity)} ${row.baseUnit}`, className: "text-right" },
    {
      id: "status",
      header: t.status,
      cell: (row) => (
        <Badge variant={row.status === "inEffect" ? "default" : row.status === "scheduled" ? "outline" : "secondary"}>
          {labels.status[row.status]}
        </Badge>
      ),
    },
  ];

  return (
    <DataTable
      label={labels.link}
      actionsLabel={editable ? t.actions : undefined}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.material}/${row.location}/${row.effectiveFrom}`}
      rowActions={editable ? (row) => <SafetyStockTargetActions row={row} context={context} labels={labels} /> : undefined}
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
