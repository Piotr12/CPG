import type { NamedRecordView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill, type TenantContext } from "../forms/form-labels";
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
    { id: "id", header: t.id, cell: (record) => <span className="font-mono">{record.id}</span> },
    {
      id: "name",
      header: t.name,
      cell: (record) => <span className={record.active ? "font-medium" : "text-muted-foreground"}>{record.name}</span>,
      // A long name wraps instead of widening the row (shadcn cells never wrap otherwise).
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "status",
      header: t.status,
      cell: (record) =>
        record.active ? (
          <Badge variant="secondary">{labels.status.active}</Badge>
        ) : (
          <Badge variant="destructive">{labels.status.inactive}</Badge>
        ),
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
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(update ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
