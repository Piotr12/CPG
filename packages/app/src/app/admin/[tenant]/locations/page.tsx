import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { NamedRecordsScreen } from "../../../../components/named-records/named-records-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { createLocation, updateLocation } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · Locations". */
export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage({ params }: PageProps<"/admin/[tenant]/locations">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Locations params={params} />
      </Suspense>
    </main>
  );
}

/** One tenant's locations, read through that tenant's own scope (R05), by any signed-in account. */
async function Locations({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const records = await cradle.locationService.list();

  return (
    <NamedRecordsScreen
      kind="locations"
      tenant={cradle.tenant}
      records={records}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
      create={createLocation}
      update={updateLocation}
    />
  );
}
