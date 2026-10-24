import type { NamedRecordView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { TenantContext } from "../forms/form-labels";
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
}

/** A tenant's locations, customers or suppliers by ID, inactive ones included and marked. */
export function NamedRecordsTable({ tenant, records, labels, update }: NamedRecordsTableProps) {
  const t = labels.columns;
  const context: TenantContext = { tenant: tenant.code, generation: tenant.generation };
  const columns: DataTableColumn<NamedRecordView>[] = [
    { id: "id", header: t.id, kind: "id", cell: (record) => record.id },
    {
      id: "name",
      header: t.name,
      kind: "longText",
      cell: (record) => <span className={record.active ? "font-medium" : "text-muted-foreground"}>{record.name}</span>,
    },
    { id: "status", header: t.status, kind: "status", cell: (record) => <ActiveStatus active={record.active} labels={labels.status} /> },
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
      empty={<EmptyText labels={labels} tenant={tenant.name} editable={update !== undefined} />}
    />
  );
}
