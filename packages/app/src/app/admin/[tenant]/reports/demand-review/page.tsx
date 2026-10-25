import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ValidationError, tenantScope, type Cradle, type DemandReviewView } from "@cpg/core";
import { demandReviewQuerySchema } from "@cpg/core/validators/reports/demand-review.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { DemandReviewScreen } from "../../../../../components/reports/demand-review-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Demand review". */
export const metadata: Metadata = { title: "Demand review" };

export default function DemandReviewPage({ params, searchParams }: PageProps<"/admin/[tenant]/reports/demand-review">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <DemandReview params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * The read, or, when the address chose a product that isn't finished (only an edited address can),
 * the read without the product filter and the refusal to show above the form (lesson 2026-10-23).
 */
async function read(cradle: Cradle, search: Record<string, unknown>): Promise<{ view: DemandReviewView; refused: boolean }> {
  const missing = ["MATERIAL_NOT_FOUND", "LOCATION_NOT_FOUND"];
  try {
    return { view: await orNotFound(cradle.demandReviewService.read(search), missing), refused: false };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return { view: await orNotFound(cradle.demandReviewService.read({ ...search, material: [] }), missing), refused: true };
  }
}

/**
 * The tenant's demand review (#240), read through that tenant's own scope (R05) by any signed-in
 * account, read-only tenants included. A malformed address or one naming a record this tenant
 * doesn't have is the not-found state.
 */
async function DemandReview({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/reports/demand-review">, "params" | "searchParams">) {
  await connection();
  await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const search = await searchParams;
  if (!demandReviewQuerySchema.safeParse(search).success) notFound();
  const { view, refused } = await read(cradle, search);

  return (
    <DemandReviewScreen
      tenant={cradle.tenant}
      view={view}
      products={await cradle.materialService.statisticalFactors()}
      locations={await cradle.locationService.list()}
      refused={refused}
      locale={locale}
      messages={messages}
    />
  );
}
