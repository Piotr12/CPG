import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { requestScope, type TenantCode } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { requireAdmin } from "../../../auth/require-admin";
import { SignedInBar } from "../../../components/auth/signed-in-bar";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

/** How the chooser presents each tenant: Test is the safe playground, Prod is live. */
const CHOICES: Record<TenantCode, { description: string; className: string }> = {
  test: { description: "Demonstration data, safe to experiment", className: "border-amber-500 bg-amber-50" },
  prod: { description: "Live data", className: "border-red-600" },
};

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
  const { systemStatusService, tenantService } = (await requestScope()).cradle;
  const [status, tenants] = await Promise.all([systemStatusService.getStatus(), tenantService.list()]);

  return (
    <>
      <SignedInBar username={user.username} />
      <nav aria-label="Choose a tenant" className="grid gap-4 sm:grid-cols-2">
        {tenants.map(({ code, name }) => (
          <Link
            key={code}
            href={`/admin/${code}`}
            className={cn("flex flex-col gap-1 rounded-xl border p-5 transition-shadow hover:shadow-md", CHOICES[code].className)}
          >
            <span className="text-lg font-semibold">{name}</span>
            <span className="text-sm text-muted-foreground">{CHOICES[code].description}</span>
            <span className="mt-2 text-sm font-semibold">Open {name} →</span>
          </Link>
        ))}
      </nav>
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
