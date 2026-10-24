import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { requireUser } from "../../../../../auth/require-admin";
import { TransferScreen } from "../../../../../components/transfers/transfer-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Transfer". */
export const metadata: Metadata = { title: "Transfer" };

export default function TransferPage({ params }: PageProps<"/admin/[tenant]/transfers/[id]">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <Transfer params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One transfer with its ledger, read through the tenant's own scope: an ID this tenant doesn't have,
 * another tenant's included, is the not-found state (TEN-014).
 */
async function Transfer({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  await connection();
  await requireUser();
  const { tenant: code, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([orNotFound(tenantScope(code), ["TENANT_NOT_FOUND"]), getMessages()]);
  const transfer = await orNotFound(cradle.transferService.get(id), ["TRANSFER_NOT_FOUND"]);
  const units = await cradle.materialService.listUnits();

  return (
    <TransferScreen
      tenant={cradle.tenant}
      transfer={transfer}
      materials={await cradle.materialService.list()}
      locations={await cradle.locationService.list()}
      units={units[transfer.material]}
      locale={locale}
      messages={messages}
    />
  );
}
