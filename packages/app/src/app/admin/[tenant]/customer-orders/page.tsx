import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { customerOrderListSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { customerOrderSortSchema } from "@cpg/core/validators/customer-orders/customer-order-list.schema";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { OrdersContent } from "../../../../components/customer-orders/orders-content";
import { readSearch, readSort } from "../../../../components/lists/list-params";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

export const metadata: Metadata = { title: "Customer orders" };

export default function CustomerOrdersPage({ params, searchParams }: PageProps<"/admin/[tenant]/customer-orders">) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
    <Suspense fallback={<LoadingMessage />}><Content params={params} searchParams={searchParams} /></Suspense>
  </main>;
}

async function Content({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/customer-orders">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const { tenant } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  const query = await searchParams;
  const page = customerOrderListSchema.safeParse({ page: query.page });
  if (!page.success) notFound();
  return <OrdersContent cradle={cradle} locale={locale} messages={messages} page={page.data.page}
    search={readSearch(query)} sort={readSort(query, customerOrderSortSchema)} />;
}
