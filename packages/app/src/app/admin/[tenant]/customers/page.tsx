import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { namedRecordSortSchema } from "@cpg/core/validators/named-records/named-record-list.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { readSearch, readSort } from "../../../../components/lists/list-params";
import { NamedRecordsScreen } from "../../../../components/named-records/named-records-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";
import { createCustomer, updateCustomer } from "./actions";

/** The tenant layout's title template puts the tenant first: "Test · Customers". */
export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage({ params, searchParams }: PageProps<"/admin/[tenant]/customers">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Customers params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's customers, read through that tenant's own scope (R05), by any signed-in account,
 * searched and sorted as the address says (#217).
 */
async function Customers({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/customers">, "params" | "searchParams">) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const query = await searchParams;
  const search = readSearch(query);
  const sort = readSort(query, namedRecordSortSchema);
  const records = await cradle.customerService.list({ q: search.q, ...sort });

  return (
    <NamedRecordsScreen
      kind="customers"
      tenant={cradle.tenant}
      records={records}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
      create={createCustomer}
      search={search}
      sort={sort}
      update={updateCustomer}
    />
  );
}
