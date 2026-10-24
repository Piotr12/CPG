import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { userSortSchema } from "@cpg/core/validators/users/user-list.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireAdmin } from "../../../../auth/require-admin";
import { listLinks, readSearch, readSort } from "../../../../components/lists/list-params";
import { ListSearchBar } from "../../../../components/lists/list-search-bar";
import { CreateUserDialog } from "../../../../components/users/create-user-dialog";
import { usersLabels } from "../../../../components/users/labels";
import { UsersTable } from "../../../../components/users/users-table";
import { getMessages } from "../../../../i18n/get-messages";

export const metadata: Metadata = { title: "Users · Caveman Planning Good" };

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * Admin only: every account, searched by username and sorted as the address says (#217), and the
 * controls to create, reset, deactivate and reactivate.
 */
async function UsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await connection();
  await requireAdmin();
  const { userService } = (await requestScope()).cradle;
  const query = await searchParams;
  const search = readSearch(query);
  const sort = readSort(query, userSortSchema);
  const [users, { locale, messages }] = await Promise.all([userService.list({ q: search.q, ...sort }), getMessages()]);
  const links = listLinks({ path: "/admin/users", search: search.q, sort, defaults: userSortSchema.parse({}) });
  const t = usersLabels(messages);

  return (
    <div lang={locale}>
      <PageHeader title={t.heading} description={t.neverDeleted} actions={<CreateUserDialog labels={t} />} />
      <ListSearchBar links={links} search={search} labels={t.search} lists={messages.lists} locale={locale} count={users.length} />
      <UsersTable users={users} labels={t} search={search.q} sort={sort} links={links} lists={messages.lists} />
    </div>
  );
}
