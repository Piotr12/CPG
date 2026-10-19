import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { AppError, tenantScope } from "@cpg/core";
import { requireUser } from "../../../auth/require-admin";
import { getMessages } from "../../../i18n/get-messages";

export default function TenantHomePage({ params }: PageProps<"/admin/[tenant]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <TenantHome params={params} />
      </Suspense>
    </main>
  );
}

/** Behind the sign-in gate (any active account, TEN-010), and read through the tenant's own scope. */
async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([openTenant((await params).tenant), getMessages()]);
  const { tenant } = cradle;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {messages.admin.heading} — {tenant.name}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{tenant.name}</CardTitle>
          <CardDescription>{messages.tenants.generation(tenant.generation)}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {messages.tenants.noRecords}
          </p>
          <Link
            href={`/admin/${tenant.code}/audit`}
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            {messages.audit.tenantHeading(tenant.name)}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

/** The tenant's scope; a tenant missing from the database renders the not-found state. */
async function openTenant(code: string) {
  try {
    return await tenantScope(code);
  } catch (error) {
    if (error instanceof AppError && error.code === "TENANT_NOT_FOUND") notFound();
    throw error;
  }
}
