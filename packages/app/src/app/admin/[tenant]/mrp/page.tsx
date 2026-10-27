import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { MrpRunScreen } from "../../../../components/mrp/mrp-run-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { runMrp } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · MRP". */
export const metadata: Metadata = { title: "MRP" };

export default function MrpPage({ params }: PageProps<"/admin/[tenant]/mrp">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Mrp params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's MRP page (E14-S02), read through that tenant's own scope (R05) by any signed-in account:
 * the latest run, and Run MRP bound to the tenant and the dataset generation this page showed.
 */
async function Mrp({ params }: Pick<PageProps<"/admin/[tenant]/mrp">, "params">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const { tenant } = cradle;

  return (
    <MrpRunScreen
      tenant={tenant}
      run={await cradle.mrpRunService.current()}
      action={runMrp.bind(null, tenant.code, tenant.generation)}
      locale={locale}
      messages={messages}
    />
  );
}
