import { fill } from "../forms/form-labels";

/**
 * A master-data list's empty state: what is missing, then the next step. The admin of a writable tenant
 * is told which action starts the list; a reader, or anyone on a read-only tenant, whom to ask.
 */
export function EmptyText({ labels, tenant, editable }: { labels: { empty: string; emptyHint: string; emptyReader: string }; tenant: string; editable: boolean }) {
  const empty = fill(labels.empty, { tenant });
  if (editable) return `${empty} ${labels.emptyHint}`;
  return (
    <>
      {`${empty} `}
      <span>{labels.emptyReader}</span>
    </>
  );
}
