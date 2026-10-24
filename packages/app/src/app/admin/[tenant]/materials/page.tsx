import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { requireUser } from "../../../../auth/require-admin";
import { ImportLink } from "../../../../components/imports/import-link";
import { CreateMaterialDialog } from "../../../../components/materials/create-material-dialog";
import { materialsLabels } from "../../../../components/materials/labels";
import { MaterialsTable } from "../../../../components/materials/materials-table";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Materials". */
export const metadata: Metadata = { title: "Materials" };

export default function MaterialsPage({ params }: PageProps<"/admin/[tenant]/materials">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Materials params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's materials, read through that tenant's own scope (R05), by any signed-in account; only
 * the admin gets Create material (TEN-004), and only while the tenant isn't read-only (the read-only
 * banner says why). The form is bound to the tenant and generation shown.
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
  const editable = user.role === "admin" && !tenant.readOnly;

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.materials.heading(tenant.name)}
        description={labels.intro}
        actions={
          editable && (
            <>
              <ImportLink tenant={tenant.code} label={messages.imports.link} />
              <CreateMaterialDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={labels} />
            </>
          )
        }
      />
      <MaterialsTable tenant={tenant} materials={materials} labels={labels} editable={editable} />
    </div>
  );
}
