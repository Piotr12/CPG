import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { requireAdmin } from "../../../auth/require-admin";
import { CreateUserDialog } from "../../../components/users/create-user-dialog";
import { usersLabels } from "../../../components/users/labels";
import { UsersTable } from "../../../components/users/users-table";
import { getMessages } from "../../../i18n/get-messages";

export const metadata: Metadata = { title: "Users · Caveman Planning Good" };

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
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
    <div lang={locale} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
        <Link href="/admin" className="text-sm font-medium underline underline-offset-4">
          {t.back}
        </Link>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t.neverDeleted}</p>
        <CreateUserDialog labels={t} />
      </div>
      <UsersTable users={users} labels={t} />
    </div>
  );
}
