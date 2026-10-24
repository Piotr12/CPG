import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { requestScope, type TenantInfo } from "@cpg/core";
import { requireUser } from "../../../auth/require-admin";
import { tenantAccessTone } from "../../../components/document-lifecycle/status-tone";
import { ResetTestCard } from "../../../components/tenants/reset-test-card";
import { ReadOnlyControls } from "../../../components/tenants/read-only-controls";
import { readOnlyControlsLabels } from "../../../components/tenants/read-only-labels";
import { TenantChoiceCard } from "../../../components/tenants/tenant-choice-card";
import { getMessages } from "../../../i18n/get-messages";
import type { Messages } from "../../../i18n/messages/en";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

/** A tenant's read-only state as a status: read-only is a warning with a lock, writable stays quiet. */
function AccessBadge({ readOnly, label }: { readOnly: boolean; label: string }) {
  const { tone, icon } = tenantAccessTone(readOnly);
  return (
    <StatusBadge tone={tone} icon={icon}>
      {label}
    </StatusBadge>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
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
    <div lang={locale} className="flex flex-col">
      <PageHeader title={t.heading} />
      <div className="flex flex-col gap-8">
        <nav aria-label={messages.tenants.choose} className="grid gap-4 sm:grid-cols-2">
          {tenants.map(({ code, name, readOnly }) => (
            <TenantChoiceCard key={code} tenant={code} href={`/admin/${code}`} name={name}>
              <span className="text-sm text-muted-foreground">{messages.tenants.description[code]}</span>
              {readOnly && (
                <span className="mt-1">
                  <AccessBadge readOnly label={messages.tenants.readOnly} />
                </span>
              )}
              <span className="mt-2 text-sm font-semibold">{messages.tenants.open(name)}</span>
            </TenantChoiceCard>
          ))}
        </nav>
        {user.role === "admin" && <ReadOnlyCard tenants={tenants} messages={messages} />}
        {user.role === "admin" && tenants.filter(({ code }) => code === "test").map((tenant) => (
          <ResetTestCard key={tenant.code} generation={tenant.generation} readOnly={tenant.readOnly} labels={t.reset} errors={messages.errors} />
        ))}
        {user.role === "admin" && <DatabaseStatus t={t} />}
      </div>
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
                <AccessBadge readOnly={readOnly} label={readOnly ? t.readOnly : t.writable} />
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
