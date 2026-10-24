"use client";

import { useState } from "react";
import Link from "next/link";
import type { ShipmentView } from "@cpg/core";
import { shipmentFormSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createShipment } from "../../app/admin/[tenant]/customer-orders/[id]/actions";
import { TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { LineQuantitiesForm, type LineQuantityChoice } from "../forms/line-quantities-form";
import { errorFormatter, fill, shipmentFieldErrorFormatter, type ShipmentsLabels } from "./labels";

interface ShipmentDialogProps {
  context: TenantContext;
  /** The order the page shows; every shipment from here is against it (SAL-008). */
  customerOrder: string;
  /** Where the goods leave from, as the dialog says it. */
  location: string;
  labels: ShipmentsLabels;
  /** The order's lines with anything outstanding. */
  lines: LineQuantityChoice[];
  /** The form's starting planned date. */
  plannedDate: string;
}

/**
 * The Create shipment button and its form, for any signed-in account. After a create, the dialog
 * closes and a notice names the shipment with a link to its page, where its goods issues post.
 */
export function ShipmentDialog({ context, customerOrder, location, labels, lines, plannedDate }: ShipmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<ShipmentView | null>(null);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <div className="flex flex-col items-start gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => setCreated(null)}>{t.open}</Button>
        </DialogTrigger>
        <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{fill(t.description, { location })}</DialogDescription>
          </DialogHeader>
          <LineQuantitiesForm
            labels={t}
            keyName="orderLine"
            lines={lines}
            date={{ label: t.plannedDate, initial: plannedDate }}
            schema={shipmentFormSchema}
            formatError={errorFormatter(labels)}
            formatFieldError={shipmentFieldErrorFormatter(labels)}
            action={(values) => createShipment(context.tenant, context.generation, customerOrder, values)}
            onSuccess={(shipment) => {
              setCreated(shipment);
              close();
            }}
            onCancel={close}
          />
        </DialogContent>
      </Dialog>
      {created && (
        <Callout
          tone="success"
          role="status"
          title={fill(labels.created, { id: created.id })}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setCreated(null)}>
              {labels.dismiss}
            </Button>
          }
        >
          <Link className="underline underline-offset-4" href={`/admin/${context.tenant}/shipments/${created.id}`}>
            {fill(labels.openCreated, { id: created.id })}
          </Link>
        </Callout>
      )}
    </div>
  );
}
