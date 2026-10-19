import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { CreateMaterialDialog } from "../../../../components/materials/create-material-dialog";
import { materialsLabels } from "../../../../components/materials/labels";
import { MaterialsTable } from "../../../../components/materials/materials-table";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Materials". */
export const metadata: Metadata = { title: "Materials" };

export default function MaterialsPage({ params }: PageProps<"/admin/[tenant]/materials">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Materials params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's materials, read through that tenant's own scope (R05), by any signed-in account; only
 * the admin gets Create material (TEN-004). The form is bound to the tenant and generation shown.
 */
async function Materials({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { tenant, materialService } = cradle;
  const materials = await materialService.list();
  const labels = materialsLabels(messages);

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.materials.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {user.role === "admin" && (
          <CreateMaterialDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={labels} />
        )}
      </div>
      <MaterialsTable tenant={tenant.code} materials={materials} labels={labels} />
    </div>
  );
}
