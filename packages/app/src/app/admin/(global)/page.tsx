import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { cn } from "@cpg/ui/lib/utils";
import { requestScope, type TenantCode } from "@cpg/core";
import { requireAdmin } from "../../../auth/require-admin";
import { SignedInBar } from "../../../components/auth/signed-in-bar";
import { getMessages } from "../../../i18n/get-messages";
import { currentPreferences } from "../../../preferences/current-preferences";

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

/** Everything behind the sign-in gate: nothing here renders without an admin session. */
async function AdminContent() {
  await connection();
  const user = await requireAdmin();
  const { systemStatusService, tenantService } = (await requestScope()).cradle;
  const [status, tenants, { locale, messages }, { theme }] = await Promise.all([
    systemStatusService.getStatus(),
    tenantService.list(),
    getMessages(),
    currentPreferences(),
  ]);
  const t = messages.admin;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <SignedInBar username={user.username} locale={locale} theme={theme} messages={messages} />
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <nav aria-label={messages.tenants.choose} className="grid gap-4 sm:grid-cols-2">
        {tenants.map(({ code, name }) => (
          <Link
            key={code}
            href={`/admin/${code}`}
            className={cn("flex flex-col gap-1 rounded-xl border p-5 transition-shadow hover:shadow-md", CHOICE_STYLES[code])}
          >
            <span className="text-lg font-semibold">{name}</span>
            <span className="text-sm text-muted-foreground">{messages.tenants.description[code]}</span>
            <span className="mt-2 text-sm font-semibold">{messages.tenants.open(name)}</span>
          </Link>
        ))}
      </nav>
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
    </div>
  );
}
