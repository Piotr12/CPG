import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { Setting } from "@cpg/db";
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
  const { config, orm, em } = (await requestScope()).cradle;
  const executed = await orm.migrator.getExecuted();
  const pending = await orm.migrator.getPending();
  const settings = await em.count(Setting);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Database</CardTitle>
        <CardDescription className="font-mono">{config.databasePath}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="secondary">{executed.length} migrations applied</Badge>
        <Badge variant={pending.length ? "destructive" : "outline"}>{pending.length} pending</Badge>
        <Badge variant="outline">{settings} settings</Badge>
      </CardContent>
    </Card>
  );
}
