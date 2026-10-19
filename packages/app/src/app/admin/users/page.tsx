import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requestScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireAdmin } from "../../../auth/require-admin";
import { CreateUserDialog } from "../../../components/users/create-user-dialog";
import { UsersTable } from "../../../components/users/users-table";

export const metadata: Metadata = { title: "Users · Caveman Planning Good" };

export default function UsersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <Link href="/admin" className="text-sm font-medium underline underline-offset-4">
          Cave control
        </Link>
      </div>
      <Suspense fallback={<LoadingMessage>Caveman count people…</LoadingMessage>}>
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
  const users = await userService.list();

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Users are never deleted. Deactivate an account to end its access; its history keeps its name.
        </p>
        <CreateUserDialog />
      </div>
      <UsersTable users={users} />
    </>
  );
}
