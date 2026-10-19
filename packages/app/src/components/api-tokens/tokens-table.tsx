"use client";

import type { ApiTokenSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { formatMinute, type TokensLabels } from "./labels";
import { RevokeTokenDialog } from "./revoke-token-dialog";

/** The account's own tokens, each with Revoke. Secrets never reach this list (API-006). */
export function TokensTable({ tokens, labels }: { tokens: ApiTokenSummary[]; labels: TokensLabels }) {
  const columns: DataTableColumn<ApiTokenSummary>[] = [
    { id: "name", header: labels.columns.name, cell: (token) => <span className="font-medium">{token.name}</span> },
    { id: "created", header: labels.columns.created, cell: (token) => formatMinute(token.createdAt) },
    {
      id: "lastUsed",
      header: labels.columns.lastUsed,
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
