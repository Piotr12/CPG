import { cancelTransfer, closeEarlyTransfer } from "../../app/admin/[tenant]/transfers/[id]/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, TransferDetailView, TransferPostingKind } from "@cpg/core";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { DatesDialog } from "./dates-dialog";
import { byId, fill, isPositive, locationName, materialName, shownQuantity, transfersLabels } from "./labels";
import { LedgerTable } from "./ledger-table";
import { PostingDialog } from "./posting-dialog";

interface TransferScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  transfer: TransferDetailView;
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** The units the transfer's material takes, its base unit first. */
  units: string[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of a transfer's page: its material, route, planned dates, quantities and status, the
 * Dispatch, Receive and Write off dialogs (each only while it can move something, never while the
 * tenant is read-only or the transfer is Completed), Change dates, and the ledger of its postings.
 */
export function TransferScreen({ tenant, transfer, materials, locations, units, locale, messages }: TransferScreenProps) {
  const labels = transfersLabels(messages);
  const t = labels.details;
  const materialsById = byId(materials);
  const locationsById = byId(locations);
  const { baseUnit } = materialsById.get(transfer.material)!;
  const amount = (quantity: string) => `${shownQuantity(quantity)} ${baseUnit}`;
  const source = locationName(locationsById, transfer.source);
  const destination = locationName(locationsById, transfer.destination);
  const details = [
    { label: t.material, value: materialName(materialsById, transfer.material) },
    { label: t.source, value: source },
    { label: t.destination, value: destination },
    { label: t.status, value: <Badge variant="secondary">{labels.status[transfer.status]}</Badge> },
    { label: t.plannedDispatch, value: transfer.plannedDispatch },
    { label: t.plannedArrival, value: transfer.plannedArrival },
    { label: t.quantity, value: amount(transfer.quantity) },
    { label: t.dispatched, value: amount(transfer.dispatched) },
    { label: t.undispatched, value: amount(transfer.undispatched) },
    { label: t.inTransit, value: <span data-transfer-in-transit>{amount(transfer.inTransit)}</span> },
    { label: t.received, value: amount(transfer.received) },
    { label: messages.lifecycle.abandoned, value: amount(transfer.abandoned) },
    { label: t.writtenOff, value: amount(transfer.writtenOff) },
  ];
  const writable = !tenant.readOnly && transfer.status === "open";
  const context = { tenant: tenant.code, generation: tenant.generation };
  /** Each posting kind with what it may move: the undispatched for a dispatch, the transit for the others. */
  const postings: { kind: TransferPostingKind; limit: string }[] = [
    { kind: "dispatch", limit: transfer.undispatched },
    { kind: "receipt", limit: transfer.inTransit },
    { kind: "write-off", limit: transfer.inTransit },
  ];
  const fills = { source, destination, baseUnit };

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.transfers.detailHeading(transfer.id, materialName(materialsById, transfer.material))}</h1>
      <p>
        <Link href={`/admin/${tenant.code}/transfers`} className="text-sm underline underline-offset-4">
          {labels.allTransfers}
        </Link>
      </p>
      <Card>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {details.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="wrap-anywhere">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <LifecycleControl available={writable} processed={transfer.dispatched !== "0.000000"}
        subject={`${labels.link} ${transfer.id}`} version={transfer.version} quantities={[amount(transfer.outstanding)]}
        notice={isPositive(transfer.inTransit) ? fill(messages.errors.TRANSFER_IN_TRANSIT, { quantity: shownQuantity(transfer.inTransit), unit: baseUnit }) : undefined}
        labels={messages.lifecycle} errors={messages.errors}
        cancel={cancelTransfer.bind(null, tenant.code, tenant.generation, transfer.id)} closeEarly={closeEarlyTransfer.bind(null, tenant.code, tenant.generation, transfer.id)} />
      {writable && (
        <div className="flex flex-wrap gap-3">
          {postings
            .filter(({ limit }) => isPositive(limit))
            .map(({ kind, limit }) => (
              <PostingDialog
                key={kind}
                context={context}
                transfer={transfer.id}
                kind={kind}
                title={fill(labels.post[kind].title, fills)}
                description={fill(labels.post[kind].description, { ...fills, limit: shownQuantity(limit) })}
                units={units}
                labels={labels}
              />
            ))}
          <DatesDialog
            context={context}
            transfer={{ id: transfer.id, plannedDispatch: transfer.plannedDispatch, plannedArrival: transfer.plannedArrival, version: transfer.version }}
            labels={labels}
          />
        </div>
      )}
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold">{labels.ledger.heading}</h2>
        <p className="text-sm text-muted-foreground">{labels.ledger.intro}</p>
        <LedgerTable postings={transfer.postings} locations={locationsById} baseUnit={baseUnit} labels={labels} />
      </section>
    </div>
  );
}
