"use client";

import type { ApiTokenSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { formatMinute, type TokensLabels } from "./labels";
import { RevokeTokenDialog } from "./revoke-token-dialog";

/**
 * Table cells don't wrap by default, so a long name (up to 64 characters, maybe without a space)
 * and the full timestamps pushed Revoke out of view. Names wrap anywhere, dates at their spaces,
 * and Created is left out below the `sm` breakpoint: Revoke must stay reachable without sideways
 * scrolling, on a phone too.
 */
const NAME_CLASS = "whitespace-normal wrap-anywhere";
const DATE_CLASS = "whitespace-normal";
const CREATED_CLASS = `${DATE_CLASS} hidden sm:table-cell`;

/** The account's own tokens, each with Revoke. Secrets never reach this list (API-006). */
export function TokensTable({ tokens, labels }: { tokens: ApiTokenSummary[]; labels: TokensLabels }) {
  const columns: DataTableColumn<ApiTokenSummary>[] = [
    {
      id: "name",
      header: labels.columns.name,
      className: NAME_CLASS,
      cell: (token) => <span className="font-medium">{token.name}</span>,
    },
    { id: "created", header: labels.columns.created, className: CREATED_CLASS, cell: (token) => formatMinute(token.createdAt) },
    {
      id: "lastUsed",
      header: labels.columns.lastUsed,
      className: DATE_CLASS,
      cell: (token) =>
        token.lastUsedAt ? formatMinute(token.lastUsedAt) : <span className="text-muted-foreground">{labels.never}</span>,
    },
  ];

  return (
    <DataTable
      label={labels.heading}
      actionsLabel={labels.columns.actions}
      columns={columns}
      rows={tokens}
      rowKey={(token) => token.id}
      rowActions={(token) => <RevokeTokenDialog token={token} labels={labels} />}
      empty={labels.empty}
    />
  );
}
