import type { ReactNode } from "react";
import type { ForecastView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { LocationCell, MaterialCell, type ReferenceDetails } from "../master-data/references";
import { ForecastActions } from "./forecast-actions";
import type { ForecastsLabels } from "./labels";

/** A forecast as the screen shows it: with its material's and location's details. */
export type ForecastRow = ForecastView & ReferenceDetails;

interface ForecastsTableProps {
  tenant: { code: string; name: string; generation: number };
  rows: ForecastRow[];
  labels: ForecastsLabels;
  /** The admin's row menus and empty-state hint; a normal user (or a read-only tenant) gets neither. */
  editable: boolean;
  /** Whether a filter is narrowing the list: an empty result then isn't an empty tenant. */
  filtered: boolean;
  /** The page links under the table. */
  pagination?: ReactNode;
}

/** A tenant's forecasts by material, location, then day: the quantity per day (DEM-001). */
export function ForecastsTable({ tenant, rows, labels, editable, filtered, pagination }: ForecastsTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<ForecastRow>[] = [
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
    { id: "date", header: t.date, kind: "date", cell: (row) => row.date },
    { id: "quantity", header: t.quantity, kind: "quantity", cell: (row) => `${shownQuantity(row.quantity)} ${row.baseUnit}` },
  ];
  const empty = filtered
    ? labels.emptyFiltered
    : [fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ");

  return (
    <DataTable
      label={labels.link}
      actionsLabel={editable ? t.actions : undefined}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.material}/${row.location}/${row.date}`}
      rowActions={editable ? (row) => <ForecastActions row={row} context={context} labels={labels} /> : undefined}
      empty={empty}
      pagination={pagination}
    />
  );
}
