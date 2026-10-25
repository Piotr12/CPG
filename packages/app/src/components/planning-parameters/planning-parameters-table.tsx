import Link from "next/link";
import type { PlanningParameterView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { PlanningParameterSort } from "@cpg/core/validators/planning-parameters/planning-parameter-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import { shownQuantity, type TenantContext } from "../forms/form-labels";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
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
  /** The list's search, marked in the material and location cells. */
  search: string;
  sort: { sort: PlanningParameterSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/**
 * A tenant's planning parameter sets by material, then location, unless sorted by another column
 * (#217); quantities in each material's base unit.
 */
export function PlanningParametersTable({ tenant, rows, labels, editable, search, sort, links, lists }: PlanningParametersTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const quantity = (value: string, row: PlanningParameterRow) => `${shownQuantity(value)} ${row.baseUnit}`;
  const columns: DataTableColumn<PlanningParameterRow>[] = [
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
    {
      id: "procurement",
      header: t.procurement,
      kind: "text",
      sortKey: "procurement",
      // A category, not a state: a tag, Make filled and Buy outlined.
      cell: (row) => (
        <Badge variant={row.procurement === "make" ? "secondary" : "outline"}>{labels.procurement[row.procurement]}</Badge>
      ),
    },
    { id: "leadTime", header: t.leadTime, kind: "quantity", sortKey: "leadTime", cell: (row) => row.leadTimeDays },
    { id: "minimum", header: t.minimum, kind: "quantity", priority: 2, sortKey: "minimum", cell: (row) => quantity(row.minimumQuantity, row) },
    { id: "multiple", header: t.multiple, kind: "quantity", priority: 2, sortKey: "multiple", cell: (row) => quantity(row.lotMultiple, row) },
  ];

  return (
    <DataTable
      label={labels.link}
      actionsLabel={editable ? t.actions : undefined}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.material}/${row.location}`}
      rowActions={editable ? (row) => <PlanningParameterActions row={row} context={context} labels={labels} /> : undefined}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={search ? <NoSearchResults links={links} query={search} lists={lists} /> : <EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
