import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { BomsScreen } from "../../../../components/boms/boms-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · BOMs". */
export const metadata: Metadata = { title: "BOMs" };

export default function BomsPage({ params }: PageProps<"/admin/[tenant]/boms">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Boms params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's BOMs, read through that tenant's own scope (R05) by any signed-in account, with its
 * materials for the rows' details and the Create BOM form's choices.
 */
async function Boms({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const boms = await cradle.bomService.list();
  const materials = await cradle.materialService.list();
  const units = await cradle.materialService.listUnits();

  return (
    <BomsScreen
      tenant={cradle.tenant}
      boms={boms}
      materials={materials}
      units={units}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
    />
  );
}
