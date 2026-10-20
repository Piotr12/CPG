import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { cn } from "@cpg/ui/lib/utils";
import { requestScope, type TenantCode, type TenantInfo } from "@cpg/core";
import { requireUser } from "../../../auth/require-admin";
import { ResetTestCard } from "../../../components/tenants/reset-test-card";
import { ReadOnlyControls } from "../../../components/tenants/read-only-controls";
import { readOnlyControlsLabels } from "../../../components/tenants/read-only-labels";
import { getMessages } from "../../../i18n/get-messages";
import type { Messages } from "../../../i18n/messages/en";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

/** How the chooser frames each tenant: Test is the safe playground, Prod is live. */
const CHOICE_STYLES: Record<TenantCode, string> = {
  test: "border-amber-500 bg-amber-50 dark:bg-amber-950/40",
  prod: "border-red-600",
};

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

/** Everything behind the sign-in gate: nothing here renders without a session. */
async function AdminContent() {
  await connection();
  const user = await requireUser();
  const { tenantService } = (await requestScope()).cradle;
  const [tenants, { locale, messages }] = await Promise.all([tenantService.list(), getMessages()]);
  const t = messages.admin;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <nav aria-label={messages.tenants.choose} className="grid gap-4 sm:grid-cols-2">
        {tenants.map(({ code, name, readOnly }) => (
          <Link
            key={code}
            href={`/admin/${code}`}
            className={cn("flex flex-col gap-1 rounded-xl border p-5 transition-shadow hover:shadow-md", CHOICE_STYLES[code])}
          >
            <span className="text-lg font-semibold">{name}</span>
            <span className="text-sm text-muted-foreground">{messages.tenants.description[code]}</span>
            {readOnly && <Badge className="mt-1">{messages.tenants.readOnly}</Badge>}
            <span className="mt-2 text-sm font-semibold">{messages.tenants.open(name)}</span>
          </Link>
        ))}
      </nav>
      {user.role === "admin" && <ReadOnlyCard tenants={tenants} messages={messages} />}
      {user.role === "admin" && tenants.filter(({ code }) => code === "test").map((tenant) => (
        <ResetTestCard key={tenant.code} generation={tenant.generation} readOnly={tenant.readOnly} labels={t.reset} errors={messages.errors} />
      ))}
      {user.role === "admin" && <DatabaseStatus t={t} />}
    </div>
  );
}

/** The admin's switches for each tenant's read-only flag (R05). */
function ReadOnlyCard({ tenants, messages }: { tenants: TenantInfo[]; messages: Messages }) {
  const t = messages.admin.readOnly;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.heading}</CardTitle>
        <CardDescription>{t.intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label={t.heading} className="flex flex-col divide-y">
          {tenants.map(({ code, name, readOnly }) => (
            <li key={code} data-tenant={code} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-3">
                <span className="font-medium">{name}</span>
                <Badge variant={readOnly ? "default" : "outline"}>{readOnly ? t.readOnly : t.writable}</Badge>
              </span>
              <ReadOnlyControls tenant={code} readOnly={readOnly} labels={readOnlyControlsLabels(messages, name)} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Where the database lives and its migration state: system detail for the admin only. */
async function DatabaseStatus({ t }: { t: Messages["admin"] }) {
  const { systemStatusService } = (await requestScope()).cradle;
  const status = await systemStatusService.getStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.database}</CardTitle>
        <CardDescription className="font-mono">{status.databasePath}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="secondary">{t.migrationsApplied(status.appliedMigrations)}</Badge>
        <Badge variant={status.pendingMigrations ? "destructive" : "outline"}>
          {t.migrationsPending(status.pendingMigrations)}
        </Badge>
        <Badge variant="outline">{t.settings(status.settings)}</Badge>
      </CardContent>
    </Card>
  );
}
