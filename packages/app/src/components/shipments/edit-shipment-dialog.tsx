"use client";

import { useState } from "react";
import { shipmentFormSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { updateShipment } from "../../app/admin/[tenant]/shipments/[id]/actions";
import { TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { LineQuantitiesForm, type LineQuantityChoice } from "../forms/line-quantities-form";
import { errorFormatter, fill, shipmentFieldErrorFormatter, type ShipmentsLabels } from "./labels";

interface EditShipmentDialogProps {
  context: TenantContext;
  /** The shipment the page shows, and its order, whose page lists it. */
  shipment: string;
  customerOrder: string;
  /** The version the page loaded; the dialog keeps the one it opened with. */
  version: number;
  /** Where the goods leave from, as the dialog says it. */
  location: string;
  labels: ShipmentsLabels;
  /** The shipment's lines, filled, then the order's other lines with anything outstanding (`shipmentEditChoices`). */
  lines: LineQuantityChoice[];
  plannedDate: string;
}

/**
 * The Edit shipment button and its form, for any signed-in account (shipment edit spec Q8): the create
 * form, filled with the stored plan. Emptying a row removes its line and filling an empty one adds a
 * line. The dialog saves at the version it opened with, so a page refreshed behind it after a
 * conflict can't turn a stale form into an overwrite (lesson "Bind an aggregate edit to the version it
 * opened with"); it closes on success, when the page shows the new plan.
 */
export function EditShipmentDialog({ context, shipment, customerOrder, version, location, labels, lines, plannedDate }: EditShipmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(version);
  const close = () => setOpen(false);
  const t = labels.edit;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setLoaded(version);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t.open}</Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{fill(t.title, { id: shipment })}</DialogTitle>
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
          action={(values) => updateShipment(context.tenant, context.generation, shipment, customerOrder, loaded, values)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
