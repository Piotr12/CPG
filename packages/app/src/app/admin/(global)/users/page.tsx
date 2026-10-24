import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireAdmin } from "../../../../auth/require-admin";
import { CreateUserDialog } from "../../../../components/users/create-user-dialog";
import { usersLabels } from "../../../../components/users/labels";
import { UsersTable } from "../../../../components/users/users-table";
import { getMessages } from "../../../../i18n/get-messages";

export const metadata: Metadata = { title: "Users · Caveman Planning Good" };

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <UsersContent />
      </Suspense>
    </main>
  );
}

/** Admin only: every account, and the controls to create, reset, deactivate and reactivate. */
async function UsersContent() {
  await connection();
  await requireAdmin();
  const { userService } = (await requestScope()).cradle;
  const [users, { locale, messages }] = await Promise.all([userService.list(), getMessages()]);
  const t = usersLabels(messages);

  return (
    <div lang={locale}>
      <PageHeader title={t.heading} description={t.neverDeleted} actions={<CreateUserDialog labels={t} />} />
      <UsersTable users={users} labels={t} />
    </div>
  );
}
