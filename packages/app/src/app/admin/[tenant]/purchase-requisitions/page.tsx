import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requisitionListQuerySchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { requisitionSortSchema } from "@cpg/core/validators/purchasing/purchase-requisition-list.schema";
import { DOCUMENT_PAGE_SIZE } from "@cpg/core/validators/shipments/shipment.schema";
import { requireUser } from "../../../../auth/require-admin";
import { listLinks, readSearch, readSort } from "../../../../components/lists/list-params";
import { RequisitionsScreen } from "../../../../components/purchase-requisitions/requisitions-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Purchase requisitions". */
export const metadata: Metadata = { title: "Purchase requisitions" };

export default function PurchaseRequisitionsPage({ params, searchParams }: PageProps<"/admin/[tenant]/purchase-requisitions">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <PurchaseRequisitions params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's purchase requisitions, read through that tenant's own scope (R05) by any signed-in
 * account, a page of 100 at a time (`?page=`; a page past the last shows the last, an invalid one is
 * not found), searched with `?q=` and sorted with `?sort=&dir=` across every page (#217), with its
 * materials and locations for the rows' details and the Create form's choices.
 */
async function PurchaseRequisitions({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/purchase-requisitions">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const address = await searchParams;
  const query = requisitionListQuerySchema.safeParse({ page: address.page });
  if (!query.success) notFound();
  const search = readSearch(address);
  const sort = readSort(address, requisitionSortSchema);
  const count = await cradle.purchaseRequisitionService.count({ q: search.q });
  const pages = Math.max(1, Math.ceil(count / DOCUMENT_PAGE_SIZE));
  const page = Math.min(query.data.page, pages);
  const links = listLinks({ path: `/admin/${cradle.tenant.code}/purchase-requisitions`, search: search.q, sort, defaults: requisitionSortSchema.parse({}) });

  return (
    <RequisitionsScreen
      tenant={cradle.tenant}
      requisitions={await cradle.purchaseRequisitionService.list({ page, q: search.q, ...sort })}
      page={page}
      pages={pages}
      list={{ search, sort, links, count }}
      materials={await cradle.materialService.list()}
      locations={await cradle.locationService.list()}
      units={await cradle.materialService.listUnits()}
      locale={locale}
      messages={messages}
    />
  );
}
