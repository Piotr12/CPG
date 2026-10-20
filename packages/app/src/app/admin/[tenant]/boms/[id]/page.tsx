import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../../auth/require-admin";
import { BomScreen } from "../../../../../components/boms/bom-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · BOM". */
export const metadata: Metadata = { title: "BOM" };

/** A revision number in `?revision=`: a positive whole number, no sign, no leading zero. */
const REVISION_NUMBER = /^[1-9]\d{0,8}$/;

export default function BomPage({ params, searchParams }: PageProps<"/admin/[tenant]/boms/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Bom params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * One BOM, read through the tenant's own scope: an ID this tenant doesn't have, another tenant's
 * included, is the not-found state (TEN-014). `?revision=N` shows an older revision instead of the
 * current one (BOM-020); a revision the BOM doesn't have, or no number at all, is not found too.
 */
async function Bom({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await requireUser();
  const { tenant: code, id } = await params;
  const { revision } = await searchParams;
  const [{ cradle }, { locale, messages }] = await Promise.all([
    orNotFound(tenantScope(code), ["TENANT_NOT_FOUND"]),
    getMessages(),
  ]);
  const bom = await orNotFound(cradle.bomService.get(id), ["BOM_NOT_FOUND"]);
  if (revision !== undefined && (typeof revision !== "string" || !REVISION_NUMBER.test(revision))) notFound();
  const historic =
    revision === undefined || Number(revision) === bom.revision
      ? null
      : await orNotFound(cradle.bomService.getRevision(id, Number(revision)), ["BOM_REVISION_NOT_FOUND"]);

  return (
    <BomScreen
      tenant={cradle.tenant}
      bom={bom}
      historic={historic}
      materials={await cradle.materialService.list()}
      units={await cradle.materialService.listUnits()}
      locale={locale}
      messages={messages}
      admin={user.role === "admin"}
    />
  );
}
