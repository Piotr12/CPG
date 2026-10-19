import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent } from "@cpg/ui/components/card";
import { requireUser } from "../../../../../auth/require-admin";
import { AddConversionDialog } from "../../../../../components/materials/add-conversion-dialog";
import { ConversionsTable } from "../../../../../components/materials/conversions-table";
import { fill, materialsLabels } from "../../../../../components/materials/labels";
import { MaterialControls } from "../../../../../components/materials/material-controls";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Material". */
export const metadata: Metadata = { title: "Material" };

export default function MaterialPage({ params }: PageProps<"/admin/[tenant]/materials/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Material params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One material and its unit conversions, read through the tenant's own scope: an ID this tenant
 * doesn't have, another tenant's included, is the not-found state (TEN-012, TEN-014). Any signed-in
 * account reads it; only the admin gets the controls (TEN-004).
 */
async function Material({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  await connection();
  const user = await requireUser();
  const { tenant: code, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(code), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { tenant, materialService } = cradle;
  const { conversions, ...material } = await orNotFound(materialService.get(id), ["MATERIAL_NOT_FOUND"]);
  const labels = materialsLabels(messages);
  const context = { tenant: tenant.code, generation: tenant.generation };
  const editable = user.role === "admin";
  const details = [
    { label: labels.columns.type, value: labels.types[material.type] },
    { label: labels.columns.baseUnit, value: material.baseUnit },
    {
      label: labels.columns.status,
      value: <Badge variant={material.active ? "secondary" : "destructive"}>{labels.status[material.active ? "active" : "inactive"]}</Badge>,
    },
    { label: labels.columns.created, value: material.createdAt.toISOString().slice(0, 10) },
  ];

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <Link href={`/admin/${tenant.code}/materials`} className="text-sm underline underline-offset-4">
        {labels.allMaterials}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
          <span className="font-mono">{material.id}</span> — {material.description}
        </h1>
        {editable && <MaterialControls material={material} context={context} labels={labels} />}
      </div>
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <section aria-labelledby="conversions-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="conversions-heading" className="text-lg font-semibold">
            {labels.conversions.heading}
          </h2>
          {editable && <AddConversionDialog material={material} context={context} labels={labels} />}
        </div>
        <p className="text-sm text-muted-foreground">{fill(labels.conversions.intro, { baseUnit: material.baseUnit })}</p>
        <ConversionsTable material={material} conversions={conversions} context={context} labels={labels} editable={editable} />
      </section>
    </div>
  );
}
