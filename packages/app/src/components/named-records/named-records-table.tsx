import Link from "next/link";
import type { NamedRecordView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { NamedRecordSort } from "@cpg/core/validators/named-records/named-record-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import type { Messages } from "../../i18n/messages/en";
import type { TenantContext } from "../forms/form-labels";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { ActiveStatus } from "../master-data/active-status";
import { EmptyText } from "../master-data/empty-text";
import type { NamedRecordsLabels, UpdateNamedRecord } from "./labels";
import { NamedRecordActions } from "./named-record-actions";

interface NamedRecordsTableProps {
  tenant: { code: string; name: string; generation: number };
  records: NamedRecordView[];
  labels: NamedRecordsLabels;
  /** The kind's update action for the admin's row menus; without it (a normal user) rows have no menu. */
  update?: UpdateNamedRecord;
  /** The list's search, marked in the ID and name cells. */
  search: string;
  sort: { sort: NamedRecordSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/**
 * A tenant's locations, customers or suppliers, inactive ones included and marked, sortable by every
 * column (#217).
 */
export function NamedRecordsTable({ tenant, records, labels, update, search, sort, links, lists }: NamedRecordsTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<NamedRecordView>[] = [
    { id: "id", header: t.id, kind: "id", sortKey: "id", cell: (record) => <Highlight text={record.id} query={search} /> },
    {
      id: "name",
      header: t.name,
      kind: "longText",
      sortKey: "name",
      cell: (record) => (
        <span className={record.active ? "font-medium" : "text-muted-foreground"}>
          <Highlight text={record.name} query={search} />
        </span>
      ),
    },
    {
      id: "status",
      header: t.status,
      kind: "status",
      sortKey: "status",
      cell: (record) => <ActiveStatus active={record.active} labels={labels.status} />,
    },
  ];

  return (
    <DataTable
      label={labels.link}
      actionsLabel={update ? t.actions : undefined}
      columns={columns}
      rows={records}
      rowKey={(record) => record.id}
      rowActions={
        update ? (record) => <NamedRecordActions record={record} context={context} labels={labels} update={update} /> : undefined
      }
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={
        search ? (
          <NoSearchResults links={links} query={search} lists={lists} />
        ) : (
          <EmptyText labels={labels} tenant={tenant.name} editable={update !== undefined} />
        )
      }
    />
  );
}
