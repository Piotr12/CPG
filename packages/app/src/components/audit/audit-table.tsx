import type { AuditEntryView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import { auditChanges, formatAuditValue, type AuditChangeValue } from "./audit-changes";

/** How many characters of a session id the table shows; the full id is in the cell's title. */
const SESSION_PREFIX_LENGTH = 8;

/** An audit's entries, newest first. Read-only: no row actions, nothing to edit (AUD-009). */
export function AuditTable({
  entries,
  label,
  labels,
}: {
  entries: AuditEntryView[];
  /** The table's accessible name: the page heading. */
  label: string;
  labels: Messages["audit"];
}) {
  const actions: Record<string, string> = labels.actions;
  const columns: DataTableColumn<AuditEntryView>[] = [
    {
      id: "time",
      header: labels.columns.time,
      cell: (entry) => <span className="font-mono text-xs">{formatTime(entry.occurredAt)}</span>,
      className: "whitespace-nowrap",
    },
    { id: "account", header: labels.columns.account, cell: (entry) => entry.actor.username },
    {
      id: "session",
      header: labels.columns.session,
      cell: (entry) =>
        entry.sessionId ? (
          <span className="font-mono text-xs" title={entry.sessionId}>
            {entry.sessionId.slice(0, SESSION_PREFIX_LENGTH)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "channel",
      header: labels.columns.channel,
      cell: (entry) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{labels.channels[entry.channel]}</Badge>
          {entry.token && <span className="text-xs">{entry.token.name}</span>}
        </span>
      ),
    },
    { id: "action", header: labels.columns.action, cell: (entry) => actions[entry.action] ?? entry.action },
    { id: "subject", header: labels.columns.subject, cell: (entry) => entry.subject.label },
    { id: "changes", header: labels.columns.changes, cell: (entry) => <Changes entry={entry} labels={labels} /> },
  ];

  return (
    <DataTable label={label} columns={columns} rows={entries} rowKey={(entry) => entry.id} empty={labels.empty} />
  );
}

function Changes({ entry, labels }: { entry: AuditEntryView; labels: Messages["audit"] }) {
  if (entry.action === "users.user.password-reset") {
    return <span className="text-muted-foreground">{labels.passwordNotRecorded}</span>;
  }
  const fields: Record<string, string> = labels.fields;
  const values: Record<string, Record<string, string>> = labels.values;
  /** A value in the reader's language when the dictionary knows it, else as stored. */
  const show = (field: string, value: AuditChangeValue) =>
    values[field]?.[String(value)] ?? formatAuditValue(value);
  return (
    <ul className="flex flex-col gap-0.5">
      {auditChanges(entry.before, entry.after).map((change) => (
        <li key={change.field} className="whitespace-nowrap">
          {fields[change.field] ?? change.field}:{" "}
          {change.kind === "set"
            ? show(change.field, change.value)
            : `${show(change.field, change.before)} → ${show(change.field, change.after)}`}
        </li>
      ))}
    </ul>
  );
}

/** `YYYY-MM-DD HH:MM:SS`, always UTC (the column header says so). */
function formatTime(time: Date): string {
  return time.toISOString().slice(0, 19).replace("T", " ");
}
