import { Suspense } from "react";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../../auth/require-admin";
import { OrderScreen } from "../../../../../components/purchase-orders/order-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Purchase order". */
export const metadata: Metadata = { title: "Purchase order" };

export default function PurchaseOrderPage({ params }: PageProps<"/admin/[tenant]/purchase-orders/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <PurchaseOrder params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One purchase order with its goods receipts, read through the tenant's own scope: an ID this tenant
 * doesn't have, another tenant's included, is the not-found state (TEN-014).
 */
async function PurchaseOrder({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  await connection();
  await requireUser();
  const { tenant: code, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([orNotFound(tenantScope(code), ["TENANT_NOT_FOUND"]), getMessages()]);
  const order = await orNotFound(cradle.purchaseOrderService.get(id), ["PURCHASE_ORDER_NOT_FOUND"]);

  return (
    <OrderScreen
      tenant={cradle.tenant}
      order={order}
      receipts={await cradle.goodsReceiptService.list({ purchaseOrder: id })}
      materials={await cradle.materialService.list()}
      units={await cradle.materialService.listUnits()}
      suppliers={await cradle.supplierService.list()}
      locations={await cradle.locationService.list()}
      locale={locale}
      messages={messages}
    />
  );
}
