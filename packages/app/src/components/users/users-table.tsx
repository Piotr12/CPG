import Link from "next/link";
import type { UserSummary } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { UserSort } from "@cpg/core/validators/users/user-list.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import type { ListLinks } from "../lists/list-params";
import { NoSearchResults } from "../lists/list-search-bar";
import { ActiveStatus } from "../master-data/active-status";
import type { UsersLabels } from "./labels";
import { UserActions } from "./user-actions";

interface UsersTableProps {
  users: UserSummary[];
  labels: UsersLabels;
  /** The list's search, marked in the username cells. */
  search: string;
  sort: { sort: UserSort; dir: SortDirection };
  links: ListLinks;
  lists: Messages["lists"];
}

/** Every account, sortable by every column (#217); normal users get a row menu, the built-in admin none. */
export function UsersTable({ users, labels, search, sort, links, lists }: UsersTableProps) {
  const columns: DataTableColumn<UserSummary>[] = [
    {
      id: "username",
      header: labels.columns.username,
      kind: "text",
      sortKey: "username",
      cell: (user) => (
        <span className={user.active ? "font-medium" : "text-muted-foreground"}>
          <Highlight text={user.username} query={search} />
        </span>
      ),
    },
    {
      id: "role",
      header: labels.columns.role,
      kind: "text",
      priority: 2,
      sortKey: "role",
      cell: (user) => <Badge variant="outline">{labels.roles[user.role]}</Badge>,
    },
    {
      id: "status",
      header: labels.columns.status,
      kind: "status",
      sortKey: "status",
      cell: (user) => <ActiveStatus active={user.active} labels={labels.status} />,
    },
    {
      id: "created",
      header: labels.columns.created,
      kind: "date",
      priority: 2,
      sortKey: "created",
      cell: (user) => user.createdAt.toISOString().slice(0, 10),
    },
  ];

  return (
    <DataTable
      label={labels.heading}
      actionsLabel={labels.columns.actions}
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      rowActions={(user) => (user.role === "user" ? <UserActions user={user} labels={labels} /> : null)}
      sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
      empty={search ? <NoSearchResults links={links} query={search} lists={lists} /> : labels.empty}
    />
  );
}
