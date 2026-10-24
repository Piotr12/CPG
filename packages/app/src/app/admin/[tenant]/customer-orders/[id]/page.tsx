import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { OrdersContent } from "../../../../../components/customer-orders/orders-content";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

export const metadata: Metadata = { title: "Customer orders" };

export default function CustomerOrderPage({ params }: PageProps<"/admin/[tenant]/customer-orders/[id]">) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
    <Suspense fallback={<LoadingMessage />}><Content params={params} /></Suspense>
  </main>;
}

async function Content({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  await connection();
  await requireUser();
  const { tenant, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  return <OrdersContent cradle={cradle} locale={locale} messages={messages} id={id} />;
}
