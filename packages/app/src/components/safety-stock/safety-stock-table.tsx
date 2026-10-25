import Link from "next/link";
import type { SafetyStockTargetView, TargetStatus } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { SafetyStockSort } from "@cpg/core/validators/safety-stock/safety-stock-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import type { Messages } from "../../i18n/messages/en";
import { targetStatusTone } from "../document-lifecycle/status-tone";
import { shownQuantity, type TenantContext } from "../forms/form-labels";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { EmptyText } from "../master-data/empty-text";
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
  /** The list's search, marked in the material and location cells. */
  search: string;
  sort: { sort: SafetyStockSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/**
 * A tenant's safety-stock targets by material, location, then date, unless sorted by another column
 * (#217), each with its status today (DEM-015, DEM-016).
 */
export function SafetyStockTable({ tenant, rows, labels, editable, search, sort, links, lists }: SafetyStockTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<SafetyStockRow>[] = [
    {
      id: "material",
      header: t.material,
      kind: "longText",
      sortKey: "material",
      cell: (row) => <MaterialCell tenant={tenant.code} row={row} inactive={labels.inactive} query={search} />,
    },
    {
      id: "location",
      header: t.location,
      kind: "longText",
      sortKey: "location",
      cell: (row) => <LocationCell row={row} inactive={labels.inactive} query={search} />,
    },
    { id: "effectiveFrom", header: t.effectiveFrom, kind: "date", sortKey: "effectiveFrom", cell: (row) => row.effectiveFrom },
    { id: "quantity", header: t.quantity, kind: "quantity", sortKey: "quantity", cell: (row) => `${shownQuantity(row.quantity)} ${row.baseUnit}` },
    {
      id: "status",
      header: t.status,
      kind: "status",
      sortKey: "status",
      cell: (row) => <StatusBadge {...targetStatusTone(row.status)}>{labels.status[row.status]}</StatusBadge>,
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
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={search ? <NoSearchResults links={links} query={search} lists={lists} /> : <EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
