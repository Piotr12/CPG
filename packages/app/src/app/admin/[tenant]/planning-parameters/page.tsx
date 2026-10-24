import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { PlanningParametersScreen } from "../../../../components/planning-parameters/planning-parameters-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Planning parameters". */
export const metadata: Metadata = { title: "Planning parameters" };

export default function PlanningParametersPage({ params }: PageProps<"/admin/[tenant]/planning-parameters">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <PlanningParameters params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's planning parameters, read through that tenant's own scope (R05) by any signed-in
 * account, with its materials and locations for the rows' details and the add form's choices.
 */
async function PlanningParameters({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const sets = await cradle.planningParameterService.list();
  const materials = await cradle.materialService.list();
  const locations = await cradle.locationService.list();

  return (
    <PlanningParametersScreen
      tenant={cradle.tenant}
      sets={sets}
      materials={materials}
      locations={locations}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
    />
  );
}
