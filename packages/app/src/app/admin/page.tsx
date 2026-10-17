import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { requestScope } from "@/server/container";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Cave control</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Caveman count rocks…</p>}>
        <DatabaseCard />
      </Suspense>
    </main>
  );
}

async function DatabaseCard() {
  await connection();
  const { systemStatusService } = (await requestScope()).cradle;
  const status = await systemStatusService.getStatus();

  return (
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
  );
}
