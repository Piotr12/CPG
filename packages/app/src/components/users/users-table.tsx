"use client";

import type { UserSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { UserActions } from "./user-actions";

const columns: DataTableColumn<UserSummary>[] = [
  {
    id: "username",
    header: "Username",
    cell: (user) => <span className={user.active ? "font-medium" : "text-muted-foreground"}>{user.username}</span>,
  },
  { id: "role", header: "Role", cell: (user) => <Badge variant="outline">{user.role}</Badge> },
  {
    id: "status",
    header: "Status",
    cell: (user) =>
      user.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Inactive</Badge>,
  },
  { id: "created", header: "Created", cell: (user) => user.createdAt.toISOString().slice(0, 10) },
];

/** Every account; normal users get a row menu, the built-in admin none. */
export function UsersTable({ users }: { users: UserSummary[] }) {
  return (
    <DataTable
      label="Users"
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      rowActions={(user) => (user.role === "user" ? <UserActions user={user} /> : null)}
      empty="No accounts yet."
    />
  );
}
