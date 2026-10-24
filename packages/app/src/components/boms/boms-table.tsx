import Link from "next/link";
import type { BomView } from "@cpg/core";
import type { BomSort } from "@cpg/core/validators/boms/bom-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import type { Messages } from "../../i18n/messages/en";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { ActiveStatus, InactiveMark } from "../master-data/active-status";
import { EmptyText } from "../master-data/empty-text";
import { fill, lineSummary, type BomsLabels, type MaterialsById } from "./labels";

interface BomsTableProps {
  tenant: { code: string; name: string };
  boms: BomView[];
  materials: MaterialsById;
  labels: BomsLabels;
  /** The admin's empty state also says how to start. */
  editable: boolean;
  /** The list's search, marked in the BOM ID and the output's ID and description. */
  search: string;
  sort: { sort: BomSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/**
 * A tenant's BOMs with their current recipes, by output, then priority (BOM-008), unless sorted by
 * another column (#217); each ID opens the BOM.
 */
export function BomsTable({ tenant, boms, materials, labels, editable, search, sort, links, lists }: BomsTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<BomView>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      sortKey: "id",
      cell: (bom) => (
        <Link href={`/admin/${tenant.code}/boms/${bom.id}`} className="underline underline-offset-4">
          <Highlight text={bom.id} query={search} />
        </Link>
      ),
    },
    {
      id: "output",
      header: t.output,
      kind: "longText",
      sortKey: "output",
      cell: (bom) => {
        const output = materials.get(bom.output)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${output.id}`} className="font-mono underline underline-offset-4">
              <Highlight text={output.id} query={search} />
            </Link>
            <span>
              <Highlight text={output.description} query={search} />
            </span>
            <InactiveMark active={output.active} label={labels.inactive} />
          </span>
        );
      },
    },
    { id: "priority", header: t.priority, kind: "quantity", sortKey: "priority", cell: (bom) => bom.priority },
    {
      id: "revision",
      header: t.revision,
      kind: "text",
      priority: 2,
      sortKey: "revision",
      cell: (bom) => fill(labels.revisionShort, { number: String(bom.revision) }),
    },
    { id: "validFrom", header: t.validFrom, kind: "date", priority: 2, sortKey: "validFrom", cell: (bom) => bom.validFrom },
    {
      id: "validThrough",
      header: t.validThrough,
      kind: "date",
      priority: 2,
      sortKey: "validThrough",
      cell: (bom) => bom.validThrough ?? labels.noEnd,
    },
    {
      id: "components",
      header: t.components,
      kind: "longText",
      priority: 3,
      cell: (bom) => {
        const summary = bom.components.map((line) => lineSummary(line, materials)).join(", ");
        return (
          <span title={summary} className="line-clamp-2 text-muted-foreground">
            {summary}
          </span>
        );
      },
    },
    { id: "status", header: t.status, kind: "status", sortKey: "status", cell: (bom) => <ActiveStatus active={bom.active} labels={labels.status} /> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={boms}
      rowKey={(bom) => bom.id}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={search ? <NoSearchResults links={links} query={search} lists={lists} /> : <EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
