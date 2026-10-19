import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { AppError, tenantScope } from "@cpg/core";
import { requireAdmin } from "../../../auth/require-admin";
import { SignedInBar } from "../../../components/auth/signed-in-bar";

export default function TenantHomePage({ params }: PageProps<"/admin/[tenant]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Cave control</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Caveman count rocks…</p>}>
        <TenantHome params={params} />
      </Suspense>
    </main>
  );
}

/** Behind the sign-in gate, and read through the tenant's own scope. */
async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireAdmin();
  const { tenant } = (await openTenant((await params).tenant)).cradle;

  return (
    <>
      <SignedInBar username={user.username} />
      <Card>
        <CardHeader>
          <CardTitle>{tenant.name}</CardTitle>
          <CardDescription>Dataset generation {tenant.generation}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No business records yet
          </p>
        </CardContent>
      </Card>
    </>
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
