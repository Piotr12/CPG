import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { NamedRecordsScreen } from "../../../../components/named-records/named-records-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { createSupplier, updateSupplier } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · Suppliers". */
export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage({ params }: PageProps<"/admin/[tenant]/suppliers">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Suppliers params={params} />
      </Suspense>
    </main>
  );
}

/** One tenant's suppliers, read through that tenant's own scope (R05), by any signed-in account. */
async function Suppliers({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const records = await cradle.supplierService.list();

  return (
    <NamedRecordsScreen
      kind="suppliers"
      tenant={cradle.tenant}
      records={records}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
      create={createSupplier}
      update={updateSupplier}
    />
  );
}
