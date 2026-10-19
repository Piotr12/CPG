import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { requestScope } from "@cpg/core";
import { requireAdmin } from "../../auth/require-admin";
import { PreferencesControls } from "../../components/preferences/preferences-controls";
import { getMessages } from "../../i18n/get-messages";
import { currentPreferences } from "../../preferences/current-preferences";
import { signOut, updatePreferences } from "./actions";

export const metadata: Metadata = { title: "Admin · Caveman Planning Good" };

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
  const { systemStatusService } = (await requestScope()).cradle;
  const [status, { locale, messages }, { theme }] = await Promise.all([
    systemStatusService.getStatus(),
    getMessages(),
    currentPreferences(),
  ]);
  const t = messages.admin;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
        <span>
          {t.signedInAs} <strong className="text-foreground">{user.username}</strong>
        </span>
        <PreferencesControls locale={locale} theme={theme} labels={messages.preferences} action={updatePreferences} />
        <form action={signOut} data-action="sign-out">
          <Button type="submit" variant="outline" size="sm">
            {t.signOut}
          </Button>
        </form>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
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
