import Link from "next/link";
import type { MaterialSummary } from "@cpg/core";
import type { MaterialSort } from "@cpg/core/validators/materials/material-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { ActiveStatus } from "../master-data/active-status";
import { EmptyText } from "../master-data/empty-text";
import type { MaterialsLabels } from "./labels";

interface MaterialsTableProps {
  tenant: { code: string; name: string };
  materials: MaterialSummary[];
  labels: MaterialsLabels;
  /** The admin's empty state also says how to start. */
  editable: boolean;
  /** The list's search, marked in the ID and description cells. */
  search: string;
  sort: { sort: MaterialSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/** A tenant's materials, sortable by every column (#217); each ID opens the material's page. */
export function MaterialsTable({ tenant, materials, labels, editable, search, sort, links, lists }: MaterialsTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<MaterialSummary>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      sortKey: "id",
      cell: (material) => (
        <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="underline underline-offset-4">
          <Highlight text={material.id} query={search} />
        </Link>
      ),
    },
    {
      id: "description",
      header: t.description,
      kind: "longText",
      sortKey: "description",
      cell: (material) => (
        <span className={material.active ? "font-medium" : "text-muted-foreground"}>
          <Highlight text={material.description} query={search} />
        </span>
      ),
    },
    { id: "type", header: t.type, kind: "text", priority: 2, sortKey: "type", cell: (material) => <Badge variant="outline">{labels.types[material.type]}</Badge> },
    { id: "baseUnit", header: t.baseUnit, kind: "text", priority: 2, sortKey: "baseUnit", cell: (material) => material.baseUnit },
    { id: "status", header: t.status, kind: "status", sortKey: "status", cell: (material) => <ActiveStatus active={material.active} labels={labels.status} /> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={materials}
      rowKey={(material) => material.id}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={search ? <NoSearchResults links={links} query={search} lists={lists} /> : <EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
