import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { OrdersScreen } from "../../../../components/purchase-orders/orders-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Purchase orders". */
export const metadata: Metadata = { title: "Purchase orders" };

export default function PurchaseOrdersPage({ params }: PageProps<"/admin/[tenant]/purchase-orders">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <PurchaseOrders params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's purchase orders, read through that tenant's own scope (R05) by any signed-in
 * account, with the suppliers, locations, materials and open requisitions the Create form offers.
 */
async function PurchaseOrders({ params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);

  return (
    <OrdersScreen
      tenant={cradle.tenant}
      orders={await cradle.purchaseOrderService.list()}
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
