import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireUser } from "../../../auth/require-admin";
import { getMessages } from "../../../i18n/get-messages";
import { orNotFound } from "../../../routing/or-not-found";

export default function TenantHomePage({ params }: PageProps<"/admin/[tenant]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <TenantHome params={params} />
      </Suspense>
    </main>
  );
}

/** Behind the sign-in gate (any active account, TEN-010), and read through the tenant's own scope. */
async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { tenant } = cradle;

  return (
    <div lang={locale}>
      <PageHeader title={`${messages.admin.tenantHeading} — ${tenant.name}`} />
      <Card>
        <CardHeader>
          <CardTitle>{tenant.name}</CardTitle>
          <CardDescription>{messages.tenants.generation(tenant.generation)}</CardDescription>
        </CardHeader>
        <CardContent>
          <nav aria-label={tenant.name} className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <Link href={`/admin/${tenant.code}/materials`} className="underline underline-offset-4">
              {messages.materials.link}
            </Link>
            <Link href={`/admin/${tenant.code}/locations`} className="underline underline-offset-4">
              {messages.locations.link}
            </Link>
            <Link href={`/admin/${tenant.code}/customers`} className="underline underline-offset-4">
              {messages.customers.link}
            </Link>
            <Link href={`/admin/${tenant.code}/suppliers`} className="underline underline-offset-4">
              {messages.suppliers.link}
            </Link>
            <Link href={`/admin/${tenant.code}/planning-parameters`} className="underline underline-offset-4">
              {messages.planningParameters.link}
            </Link>
            <Link href={`/admin/${tenant.code}/safety-stock`} className="underline underline-offset-4">
              {messages.safetyStock.link}
            </Link>
            <Link href={`/admin/${tenant.code}/forecasts`} className="underline underline-offset-4">
              {messages.forecasts.link}
            </Link>
            <Link href={`/admin/${tenant.code}/boms`} className="underline underline-offset-4">
              {messages.boms.link}
            </Link>
            <Link href={`/admin/${tenant.code}/audit`} className="underline underline-offset-4">
              {messages.audit.tenantHeading(tenant.name)}
            </Link>
          </nav>
        </CardContent>
      </Card>
    </div>
  );
}
