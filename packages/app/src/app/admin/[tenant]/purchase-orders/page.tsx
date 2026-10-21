import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { purchaseOrderListQuerySchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { DOCUMENT_PAGE_SIZE } from "@cpg/core/validators/shipments/shipment.schema";
import { requireUser } from "../../../../auth/require-admin";
import { OrdersScreen } from "../../../../components/purchase-orders/orders-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Purchase orders". */
export const metadata: Metadata = { title: "Purchase orders" };

export default function PurchaseOrdersPage({ params, searchParams }: PageProps<"/admin/[tenant]/purchase-orders">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <PurchaseOrders params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's purchase orders, read through that tenant's own scope (R05) by any signed-in
 * account, a page of 100 at a time (`?page=`; a page past the last shows the last, an invalid one is
 * not found), with the suppliers, locations, materials and open requisitions the Create form offers.
 */
async function PurchaseOrders({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/purchase-orders">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const query = purchaseOrderListQuerySchema.safeParse({ page: (await searchParams).page });
  if (!query.success) notFound();
  const pages = Math.max(1, Math.ceil((await cradle.purchaseOrderService.count()) / DOCUMENT_PAGE_SIZE));
  const page = Math.min(query.data.page, pages);

  return (
    <OrdersScreen
      tenant={cradle.tenant}
      orders={await cradle.purchaseOrderService.list(page)}
      page={page}
      pages={pages}
      suppliers={await cradle.supplierService.list()}
      locations={await cradle.locationService.list()}
      materials={await cradle.materialService.list()}
      units={await cradle.materialService.listUnits()}
      requisitions={await cradle.purchaseRequisitionService.list()}
      locale={locale}
      messages={messages}
    />
  );
}
