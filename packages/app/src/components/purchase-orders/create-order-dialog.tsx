"use client";

import { useState } from "react";
import { orderCreateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createOrder } from "../../app/admin/[tenant]/purchase-orders/actions";
import { TALL_DIALOG, type FormOption } from "../forms/form-labels";
import type { MaterialChoice } from "../purchase-requisitions/requisition-form";
import type { RequisitionChoice } from "./choices";
import type { OrdersLabels, TenantContext } from "./labels";
import { OrderForm } from "./order-form";

interface CreateOrderDialogProps {
  context: TenantContext;
  labels: OrdersLabels;
  suppliers: FormOption[];
  locations: FormOption[];
  materials: MaterialChoice[];
  requisitions: RequisitionChoice[];
}

/** The Create purchase order button and its form, for any signed-in account; the server assigns the ID (LFC-001). */
export function CreateOrderDialog({ context, labels, suppliers, locations, materials, requisitions }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <OrderForm
          labels={labels}
          suppliers={suppliers}
          locations={locations}
          materials={materials}
          requisitions={requisitions}
          schema={orderCreateSchema}
          action={(values) => createOrder(context.tenant, context.generation, values)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
