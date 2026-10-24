"use client";

import type { UserSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { ActiveStatus } from "../master-data/active-status";
import type { UsersLabels } from "./labels";
import { UserActions } from "./user-actions";

/** Every account; normal users get a row menu, the built-in admin none. */
export function UsersTable({ users, labels }: { users: UserSummary[]; labels: UsersLabels }) {
  const columns: DataTableColumn<UserSummary>[] = [
    {
      id: "username",
      header: labels.columns.username,
      kind: "text",
      cell: (user) => <span className={user.active ? "font-medium" : "text-muted-foreground"}>{user.username}</span>,
    },
    { id: "role", header: labels.columns.role, kind: "text", priority: 2, cell: (user) => <Badge variant="outline">{labels.roles[user.role]}</Badge> },
    { id: "status", header: labels.columns.status, kind: "status", cell: (user) => <ActiveStatus active={user.active} labels={labels.status} /> },
    { id: "created", header: labels.columns.created, kind: "date", priority: 2, cell: (user) => user.createdAt.toISOString().slice(0, 10) },
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
