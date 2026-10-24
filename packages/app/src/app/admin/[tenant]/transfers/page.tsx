import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { TRANSFER_PAGE_SIZE, transferListSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { transferSortSchema } from "@cpg/core/validators/transfers/transfer-list.schema";
import { requireUser } from "../../../../auth/require-admin";
import { listLinks, readSearch, readSort } from "../../../../components/lists/list-params";
import { TransfersScreen } from "../../../../components/transfers/transfers-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Transfers". */
export const metadata: Metadata = { title: "Transfers" };

export default function TransfersPage({ params, searchParams }: PageProps<"/admin/[tenant]/transfers">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Transfers params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One page of a tenant's transfers, read through that tenant's own scope (R05) by any signed-in
 * account, with its materials and locations for the rows and the Create form. A page past the last
 * shows the last; a malformed one is the not-found state. `?q=` searches and `?sort=&dir=` sorts
 * every page (#217).
 */
async function Transfers({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/transfers">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const address = await searchParams;
  const query = transferListSchema.safeParse({ page: address.page });
  if (!query.success) notFound();
  const search = readSearch(address);
  const sort = readSort(address, transferSortSchema);
  const total = await cradle.transferService.count({ q: search.q });
  const page = Math.min(query.data.page, Math.max(1, Math.ceil(total / TRANSFER_PAGE_SIZE)));
  const links = listLinks({ path: `/admin/${cradle.tenant.code}/transfers`, search: search.q, sort, defaults: transferSortSchema.parse({}) });

  return (
    <TransfersScreen
      tenant={cradle.tenant}
      transfers={await cradle.transferService.list({ page, q: search.q, ...sort })}
      page={page}
      total={total}
      list={{ search, sort, links }}
      materials={await cradle.materialService.list()}
      locations={await cradle.locationService.list()}
      units={await cradle.materialService.listUnits()}
      locale={locale}
      messages={messages}
    />
  );
}
