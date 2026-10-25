import type { ReactNode } from "react";
import Link from "next/link";
import type { ForecastView } from "@cpg/core";
import type { ForecastSort } from "@cpg/core/validators/forecasts/forecast-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
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
  /** The list's search: its words are marked in the material and location cells, and an empty result says nothing matched it. */
  search: string;
  /** The list's sort and the links that sort it by another column (#217). */
  sort: { sort: ForecastSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
  /** The page links under the table. */
  pagination?: ReactNode;
}

/**
 * A tenant's forecasts by material, location, then day unless a header sorts them by another of
 * those columns (#217): the quantity per day (DEM-001).
 */
export function ForecastsTable({ tenant, rows, labels, editable, filtered, search, sort, links, lists, pagination }: ForecastsTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<ForecastRow>[] = [
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
    { id: "date", header: t.date, kind: "date", sortKey: "date", cell: (row) => row.date },
    { id: "quantity", header: t.quantity, kind: "quantity", sortKey: "quantity", cell: (row) => `${shownQuantity(row.quantity)} ${row.baseUnit}` },
  ];
  const empty = search
    ? <NoSearchResults links={links} query={search} lists={lists} />
    : filtered
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
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={empty}
      pagination={pagination}
    />
  );
}
