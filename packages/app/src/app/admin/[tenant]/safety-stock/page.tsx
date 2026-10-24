import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { SafetyStockScreen } from "../../../../components/safety-stock/safety-stock-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Safety stock". */
export const metadata: Metadata = { title: "Safety stock" };

export default function SafetyStockPage({ params }: PageProps<"/admin/[tenant]/safety-stock">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <SafetyStock params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's safety-stock targets, read through that tenant's own scope (R05) by any signed-in
 * account, each labelled with where it stands today: the server's UTC date (spec Q10).
 */
async function SafetyStock({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const targets = await cradle.safetyStockTargetService.list();
  const materials = await cradle.materialService.list();
  const locations = await cradle.locationService.list();

  return (
    <SafetyStockScreen
      tenant={cradle.tenant}
      targets={targets}
      materials={materials}
      locations={locations}
      today={new Date().toISOString().slice(0, 10)}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
    />
  );
}
