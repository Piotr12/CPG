"use client";

import { useState } from "react";
import type { CustomerOrderView } from "@cpg/core";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createCustomerOrder, updateCustomerOrder } from "../../app/admin/[tenant]/customer-orders/actions";
import { fill, TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import type { OrderLabels } from "./labels";
import { OrderForm, type OrderChoices } from "./order-form";

interface Props { context: TenantContext; labels: OrderLabels; choices: OrderChoices; order?: CustomerOrderView }
/** One accessible create/edit dialog; the page's bound version protects every line. */
export function OrderDialog({ context, labels, choices, order }: Props) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(order);
  const editing = open ? snapshot : order;
  const close = () => setOpen(false);
  const initial = editing ? {
    customer: editing.customer, location: editing.location,
    lines: editing.lines.map(({ id, material, enteredQuantity, enteredUnit, requiredDate }) => ({ id, material, quantity: enteredQuantity, unit: enteredUnit, requiredDate })),
  } : undefined;
  return <Dialog open={open} onOpenChange={(next) => {
    if (next) setSnapshot(order);
    setOpen(next);
  }}>
    <DialogTrigger asChild><Button>{order ? labels.edit : labels.create}</Button></DialogTrigger>
    <DialogContent className={`sm:max-w-2xl ${TALL_DIALOG}`}>
      <DialogHeader><DialogTitle>{order ? fill(labels.editTitle, { id: order.id }) : labels.createTitle}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
      <OrderForm lockedLines={editing?.lines.filter(({ posted }) => posted).map(({ id }) => id)} labels={labels} choices={choices} initial={initial}
        action={(values) => editing ? updateCustomerOrder(context.tenant, context.generation, editing.id, editing.version, values) : createCustomerOrder(context.tenant, context.generation, values)}
        onSuccess={close} onCancel={close} />
    </DialogContent>
  </Dialog>;
}
