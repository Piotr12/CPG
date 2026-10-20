import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../auth/require-admin";
import { OrdersContent } from "../../../../components/customer-orders/orders-content";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

export const metadata: Metadata = { title: "Customer orders" };

export default function CustomerOrdersPage({ params }: PageProps<"/admin/[tenant]/customer-orders">) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
    <Suspense fallback={<div aria-busy="true" className="min-h-40" />}><Content params={params} /></Suspense>
  </main>;
}

async function Content({ params }: { params: Promise<{ tenant: string;  }> }) {
  await connection();
  await requireUser();
  const { tenant } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  return <OrdersContent cradle={cradle} locale={locale} messages={messages}  />;
}
