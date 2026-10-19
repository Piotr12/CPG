import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { NamedRecordsScreen } from "../../../../components/named-records/named-records-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { createLocation, updateLocation } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · Locations". */
export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage({ params }: PageProps<"/admin/[tenant]/locations">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
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
