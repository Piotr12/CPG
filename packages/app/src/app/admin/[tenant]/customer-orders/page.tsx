import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { customerOrderListSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { OrdersContent } from "../../../../components/customer-orders/orders-content";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

export const metadata: Metadata = { title: "Customer orders" };

export default function CustomerOrdersPage({ params, searchParams }: PageProps<"/admin/[tenant]/customer-orders">) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
    <Suspense fallback={<div aria-busy="true" className="min-h-40" />}><Content params={params} searchParams={searchParams} /></Suspense>
  </main>;
}

async function Content({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/customer-orders">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const { tenant } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  const query = customerOrderListSchema.safeParse({ page: (await searchParams).page });
  if (!query.success) notFound();
  return <OrdersContent cradle={cradle} locale={locale} messages={messages} page={query.data.page} />;
}
