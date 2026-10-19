import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { requestScope } from "@cpg/core";
import { requireAdmin } from "../../auth/require-admin";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Cave control</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Caveman count rocks…</p>}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

/** Everything behind the sign-in gate: nothing here renders without an admin session. */
async function AdminContent() {
  await connection();
  const user = await requireAdmin();
  const { systemStatusService } = (await requestScope()).cradle;
  const status = await systemStatusService.getStatus();

  return (
    <>
      <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
        <span>
          Signed in as <strong className="text-foreground">{user.username}</strong>
        </span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription className="font-mono">{status.databasePath}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{status.appliedMigrations} migrations applied</Badge>
          <Badge variant={status.pendingMigrations ? "destructive" : "outline"}>
            {status.pendingMigrations} pending
          </Badge>
          <Badge variant="outline">{status.settings} settings</Badge>
        </CardContent>
      </Card>
    </>
  );
}
