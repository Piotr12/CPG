import { Suspense } from "react";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import type { Metadata } from "next";
import { connection } from "next/server";
import { tenantScope } from "@cpg/core";
import { requireUser } from "../../../../../auth/require-admin";
import { ShipmentScreen } from "../../../../../components/shipments/shipment-screen";
import { getMessages } from "../../../../../i18n/get-messages";
import { orNotFound } from "../../../../../routing/or-not-found";

/** The tenant layout's title template puts the tenant first: "Test · Shipment". */
export const metadata: Metadata = { title: "Shipment" };

export default function ShipmentPage({ params }: PageProps<"/admin/[tenant]/shipments/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingMessage />}>
        <Shipment params={params} />
      </Suspense>
    </main>
  );
}

/**
 * One shipment with its goods issues, read through the tenant's own scope: an ID this tenant doesn't
 * have, another tenant's included, is the not-found state (TEN-014).
 */
async function Shipment({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  await connection();
  await requireUser();
  const { tenant: code, id } = await params;
  const [{ cradle }, { locale, messages }] = await Promise.all([orNotFound(tenantScope(code), ["TENANT_NOT_FOUND"]), getMessages()]);
  const shipment = await orNotFound(cradle.shipmentService.get(id), ["SHIPMENT_NOT_FOUND"]);

  return (
    <ShipmentScreen
      tenant={cradle.tenant}
      shipment={shipment}
      issues={await cradle.goodsIssueService.list({ shipment: id })}
      materials={await cradle.materialService.list()}
      units={await cradle.materialService.listUnits()}
      customers={await cradle.customerService.list()}
      locations={await cradle.locationService.list()}
      locale={locale}
      messages={messages}
    />
  );
}
