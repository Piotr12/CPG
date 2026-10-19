"use client";

import type { UserSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { UsersLabels } from "./labels";
import { UserActions } from "./user-actions";

/** Every account; normal users get a row menu, the built-in admin none. */
export function UsersTable({ users, labels }: { users: UserSummary[]; labels: UsersLabels }) {
  const columns: DataTableColumn<UserSummary>[] = [
    {
      id: "username",
      header: labels.columns.username,
      cell: (user) => <span className={user.active ? "font-medium" : "text-muted-foreground"}>{user.username}</span>,
    },
    { id: "role", header: labels.columns.role, cell: (user) => <Badge variant="outline">{labels.roles[user.role]}</Badge> },
    {
      id: "status",
      header: labels.columns.status,
      cell: (user) =>
        user.active ? (
          <Badge variant="secondary">{labels.status.active}</Badge>
        ) : (
          <Badge variant="destructive">{labels.status.inactive}</Badge>
        ),
    },
    { id: "created", header: labels.columns.created, cell: (user) => user.createdAt.toISOString().slice(0, 10) },
  ];

  return (
    <DataTable
      label={labels.heading}
      actionsLabel={labels.columns.actions}
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      rowActions={(user) => (user.role === "user" ? <UserActions user={user} labels={labels} /> : null)}
      empty={labels.empty}
    />
  );
}
