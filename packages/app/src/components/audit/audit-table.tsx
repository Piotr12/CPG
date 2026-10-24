import Link from "next/link";
import type { AuditEntryView, AuditReversalLink } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { auditChanges, formatAuditValue, type AuditChangeValue } from "./audit-changes";
import { businessDateOf, recordHistoryUrl, reversalOf } from "./audit-query";

/** How many characters of a session or movement id the table shows; the full id is in the title. */
const ID_PREFIX_LENGTH = 8;

/** A per-line snapshot field, such as `line2Status`: the line number and the field it holds. */
const LINE_FIELD = /^line(\d+)([A-Z]\w*)$/;
/** One of a completion reversal's movement pairs: `movement2Original`, `movement2Inverse`. */
const MOVEMENT_FIELD = /^movement(\d+)(Original|Inverse)$/;

/**
 * An audit's entries, newest first. Read-only: no row actions, nothing to edit (AUD-009). Each subject
 * opens that record's history on the same screen; an entry that recorded a business date shows it under
 * the audit timestamp (AUD-030); a stock movement links to its reversal partner (AUD-004, REV-020).
 */
export function AuditTable({
  entries,
  label,
  path,
  reversals,
  empty,
  labels,
}: {
  entries: AuditEntryView[];
  /** The table's accessible name: the page heading. */
  label: string;
  /** The audit screen's path, for the history links. */
  path: string;
  reversals: readonly AuditReversalLink[];
  /** What an empty page says: nothing recorded yet, or nothing matching the filters. */
  empty: string;
  labels: Messages["audit"];
}) {
  const actions: Record<string, string> = labels.actions;
  const columns: DataTableColumn<AuditEntryView>[] = [
    {
      id: "time",
      header: labels.columns.time,
      kind: "date",
      cell: (entry) => <Time entry={entry} labels={labels} />,
      className: "align-top",
    },
    { id: "account", header: labels.columns.account, kind: "text", cell: (entry) => entry.actor.username, className: "align-top" },
    {
      id: "session",
      header: labels.columns.session,
      kind: "id",
      priority: 3,
      className: "align-top",
      cell: (entry) =>
        entry.sessionId ? (
          <span className="text-xs" title={entry.sessionId}>
            {entry.sessionId.slice(0, ID_PREFIX_LENGTH)}
          </span>
        ) : (
          <span aria-label="none">—</span>
        ),
    },
    {
      id: "channel",
      header: labels.columns.channel,
      kind: "text",
      priority: 2,
      className: "align-top",
      cell: (entry) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{labels.channels[entry.channel]}</Badge>
          {entry.token && <span className="text-xs">{entry.token.name}</span>}
        </span>
      ),
    },
    {
      id: "action",
      header: labels.columns.action,
      kind: "text",
      className: "whitespace-normal align-top",
      cell: (entry) => actions[entry.action] ?? entry.action,
    },
    {
      id: "subject",
      header: labels.columns.subject,
      kind: "longText",
      className: "align-top",
      cell: (entry) => (
        <Link
          href={recordHistoryUrl(path, entry.subject)}
          aria-label={fill(labels.history, { label: entry.subject.label })}
          className="wrap-anywhere underline underline-offset-4"
        >
          {entry.subject.label}
        </Link>
      ),
    },
    {
      id: "changes",
      header: labels.columns.changes,
      kind: "longText",
      className: "align-top",
      cell: (entry) => <Changes entry={entry} path={path} reversals={reversals} labels={labels} />,
    },
  ];

  return <DataTable label={label} columns={columns} rows={entries} rowKey={(entry) => entry.id} empty={empty} />;
}

/** The audit timestamp (UTC) and, when the entry recorded one, its business date beneath it. */
function Time({ entry, labels }: { entry: AuditEntryView; labels: Messages["audit"] }) {
  const businessDate = businessDateOf(entry);
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-xs">{formatTime(entry.occurredAt)}</span>
      {businessDate && (
        <span className="text-xs text-muted-foreground">
          {labels.businessDate} <span className="font-mono text-foreground">{businessDate}</span>
        </span>
      )}
    </span>
  );
}

function Changes({
  entry,
  path,
  reversals,
  labels,
}: {
  entry: AuditEntryView;
  path: string;
  reversals: readonly AuditReversalLink[];
  labels: Messages["audit"];
}) {
  const reversal = reversalOf(entry.subject, reversals);
  const partners = reversal
    ? ([[labels.reverses, reversal.reverses], [labels.reversedBy, reversal.reversedBy]] as const).filter(
        (partner): partner is readonly [string, string] => partner[1] !== null,
      )
    : [];
  return (
    <div className="flex flex-col gap-2">
      {entry.action === "users.user.password-reset" ? (
        <span className="text-muted-foreground">{labels.passwordNotRecorded}</span>
      ) : (
        <ChangeList entry={entry} labels={labels} />
      )}
      {partners.map(([text, movement]) => (
        <span key={text} className="text-sm font-medium">
          {text}{" "}
          <Link
            href={recordHistoryUrl(path, { type: "StockMovement", id: movement })}
            title={movement}
            className="font-mono text-xs underline underline-offset-4"
          >
            {movement.slice(0, ID_PREFIX_LENGTH)}
          </Link>
        </span>
      ))}
    </div>
  );
}

function ChangeList({ entry, labels }: { entry: AuditEntryView; labels: Messages["audit"] }) {
  const values: Record<string, Record<string, string>> = labels.values;
  /**
   * The dictionaries a field's values are looked up in: a per-line field (`line2Status`) tries its line
   * wording first (`lineStatus`), then the plain field (`status`).
   */
  const dictionaries = (field: string) => {
    const line = LINE_FIELD.exec(field);
    return line ? [`line${line[2]}`, line[2][0].toLowerCase() + line[2].slice(1)] : [field];
  };
  /** A value in the reader's language when a dictionary knows it, else as stored. */
  const show = (field: string, value: AuditChangeValue) =>
    dictionaries(field).map((key) => values[key]?.[String(value)]).find((shown) => shown !== undefined) ?? formatAuditValue(value);
  return (
    <ul className="flex flex-col gap-1">
      {auditChanges(entry.before, entry.after).map((change) => (
        <li key={change.field} className="wrap-anywhere">
          {fieldLabel(change.field, labels)}:{" "}
          {change.kind === "set"
            ? show(change.field, change.value)
            : `${show(change.field, change.before)} → ${show(change.field, change.after)}`}
        </li>
      ))}
    </ul>
  );
}

/** A snapshot field's name in the reader's language: per-line fields read "line 2: status", movement pairs "original movement 2". */
export function fieldLabel(field: string, labels: Messages["audit"]): string {
  const fields: Record<string, string> = labels.fields;
  const movement = MOVEMENT_FIELD.exec(field);
  if (movement) return fill(labels.movementField[movement[2] === "Original" ? "original" : "inverse"], { movement: movement[1] });
  const line = LINE_FIELD.exec(field);
  if (!line) return fields[field] ?? field;
  const inner = line[2][0].toLowerCase() + line[2].slice(1);
  return fill(labels.lineField, { line: line[1], field: fields[inner] ?? inner });
}

/** `YYYY-MM-DD HH:MM:SS`, always UTC (the column header says so). */
function formatTime(time: Date): string {
  return time.toISOString().slice(0, 19).replace("T", " ");
}
