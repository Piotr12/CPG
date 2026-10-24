import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { bomSortSchema } from "@cpg/core/validators/boms/bom-list.schema";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../auth/require-admin";
import { readSearch, readSort } from "../../../../components/lists/list-params";
import { BomsScreen } from "../../../../components/boms/boms-screen";
import { getMessages } from "../../../../i18n/get-messages";
import { orNotFound } from "../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · BOMs". */
export const metadata: Metadata = { title: "BOMs" };

export default function BomsPage({ params, searchParams }: PageProps<"/admin/[tenant]/boms">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Boms params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One tenant's BOMs, read through that tenant's own scope (R05) by any signed-in account, with its
 * materials for the rows' details and the Create BOM form's choices, searched and sorted as the
 * address says (#217).
 */
async function Boms({ params, searchParams }: Pick<PageProps<"/admin/[tenant]/boms">, "params" | "searchParams">) {
  await connection();
  const user = await requireUser();
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope((await params).tenant), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const query = await searchParams;
  const search = readSearch(query);
  const sort = readSort(query, bomSortSchema);
  const boms = await cradle.bomService.list({ q: search.q, ...sort });
  const materials = await cradle.materialService.list();
  const units = await cradle.materialService.listUnits();

  return (
    <BomsScreen
      tenant={cradle.tenant}
      boms={boms}
      materials={materials}
      units={units}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
      search={search}
      sort={sort}
    />
  );
}
