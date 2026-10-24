"use client";

import { useState } from "react";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Button } from "@cpg/ui/components/button";
import { cancelShipment } from "../../app/admin/[tenant]/shipments/[id]/actions";
import type { TenantContext } from "../forms/form-labels";
import { errorFormatter, fill, type ShipmentsLabels } from "./labels";

interface CancelShipmentButtonProps {
  context: TenantContext;
  shipment: string;
  customerOrder: string;
  /** The version the page loaded; the confirmation keeps the one it opened with. */
  version: number;
  labels: ShipmentsLabels;
}

/**
 * The Cancel shipment button and its confirmation (shipment edit spec Q6), offered while nothing was
 * ever issued against the shipment. On success the page refreshes to show it Cancelled.
 */
export function CancelShipmentButton({ context, shipment, customerOrder, version, labels }: CancelShipmentButtonProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(version);
  const t = labels.cancel;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setLoaded(version);
        setOpen(next);
      }}
      trigger={<Button variant="destructive">{t.open}</Button>}
      title={fill(t.title, { id: shipment })}
      description={t.description}
      confirmLabel={t.confirm}
      pendingLabel={t.pending}
      cancelLabel={t.keep}
      destructive
      action={() => cancelShipment(context.tenant, context.generation, shipment, customerOrder, loaded)}
      formatError={errorFormatter(labels)}
    />
  );
}
