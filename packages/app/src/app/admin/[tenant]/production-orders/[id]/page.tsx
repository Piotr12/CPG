import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { productionCompletionListSchema } from "@cpg/core/validators/production-orders/production-completion.schema";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { ProductionContent } from "../../../../../components/production-orders/production-content";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

export const metadata: Metadata = { title: "Production orders" };

export default function ProductionOrderPage({ params, searchParams }: PageProps<"/admin/[tenant]/production-orders/[id]">) {
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
    <Suspense fallback={<LoadingMessage />}><Content params={params} searchParams={searchParams} /></Suspense>
  </main>;
}

async function Content({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/production-orders/[id]">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const { tenant, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(tenant), ["TENANT_NOT_FOUND"]), getMessages(),
  ]);
  // `?completions=N` pages the order's completion history, newest first.
  const query = productionCompletionListSchema.safeParse({ page: (await searchParams).completions });
  if (!query.success) notFound();
  return <ProductionContent cradle={cradle} locale={locale} messages={messages} id={id} completionsPage={query.data.page} />;
}
