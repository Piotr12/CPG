import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { purchaseOrderListQuerySchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { purchaseOrderSortSchema } from "@cpg/core/validators/purchasing/purchase-order-list.schema";
import { DOCUMENT_PAGE_SIZE } from "@cpg/core/validators/shipments/shipment.schema";
import { requireUser } from "../../../../auth/require-admin";
import { listLinks, readSearch, readSort } from "../../../../components/lists/list-params";
import { OrdersScreen } from "../../../../components/purchase-orders/orders-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Purchase orders". */
export const metadata: Metadata = { title: "Purchase orders" };

export default function PurchaseOrdersPage({ params, searchParams }: PageProps<"/admin/[tenant]/purchase-orders">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <PurchaseOrders params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's purchase orders, read through that tenant's own scope (R05) by any signed-in
 * account, a page of 100 at a time (`?page=`; a page past the last shows the last, an invalid one is
 * not found), searched with `?q=` and sorted with `?sort=&dir=` across every page (#217), with the
 * suppliers, locations, materials and open requisitions the Create form offers.
 */
async function PurchaseOrders({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/purchase-orders">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const address = await searchParams;
  const query = purchaseOrderListQuerySchema.safeParse({ page: address.page });
  if (!query.success) notFound();
  const search = readSearch(address);
  const sort = readSort(address, purchaseOrderSortSchema);
  const count = await cradle.purchaseOrderService.count({ q: search.q });
  const pages = Math.max(1, Math.ceil(count / DOCUMENT_PAGE_SIZE));
  const page = Math.min(query.data.page, pages);
  const links = listLinks({ path: `/admin/${cradle.tenant.code}/purchase-orders`, search: search.q, sort, defaults: purchaseOrderSortSchema.parse({}) });

  return (
    <OrdersScreen
      tenant={cradle.tenant}
      orders={await cradle.purchaseOrderService.list({ page, q: search.q, ...sort })}
      page={page}
      pages={pages}
      list={{ search, sort, links, count }}
      suppliers={await cradle.supplierService.list()}
      locations={await cradle.locationService.list()}
      materials={await cradle.materialService.list()}
      units={await cradle.materialService.listUnits()}
      requisitions={await cradle.purchaseRequisitionService.listOpen()}
      locale={locale}
      messages={messages}
    />
  );
}
