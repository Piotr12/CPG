"use client";

import { useState } from "react";
import type { PostedReceiptView } from "@cpg/core";
import { receiptFormSchema } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { postReceipt } from "../../app/admin/[tenant]/purchase-orders/[id]/actions";
import { TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { fill, shownQuantity, type ReceiptLineChoice, type ReceiptsLabels } from "./labels";
import { ReceiptForm } from "./receipt-form";

interface ReceiptDialogProps {
  context: TenantContext;
  /** The order the page shows; every receipt from here is against it (BUY-013). */
  purchaseOrder: string;
  /** Where its stock goes, as the dialog says it. */
  location: string;
  labels: ReceiptsLabels;
  lines: ReceiptLineChoice[];
  /** Each line's material base unit, by line number, for the excess warnings. */
  baseUnits: Record<number, string>;
  /** Whether the order takes receipts (it is Open). A post that completes it hides the button, never the notice. */
  canPost: boolean;
}

/**
 * The Post goods receipt button and its form, for any signed-in account. After a post, the dialog
 * closes and a notice names the receipt and any line that received more than was outstanding: an
 * excess is accepted, and said (BUY-015).
 */
export function ReceiptDialog({ context, purchaseOrder, location, labels, lines, baseUnits, canPost }: ReceiptDialogProps) {
  const [open, setOpen] = useState(false);
  const [posted, setPosted] = useState<PostedReceiptView | null>(null);
  const close = () => setOpen(false);
  const t = labels.post;

  return (
    <div className="flex flex-col items-start gap-3">
      {canPost && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setPosted(null)}>{t.open}</Button>
          </DialogTrigger>
          <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{fill(t.description, { location })}</DialogDescription>
            </DialogHeader>
            <ReceiptForm
              labels={labels}
              lines={lines}
              schema={receiptFormSchema}
              action={(values) => postReceipt(context.tenant, context.generation, purchaseOrder, values)}
              onSuccess={(receipt) => {
                setPosted(receipt);
                close();
              }}
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
      )}
      {posted && (
        <div role="status" className="flex w-full flex-col gap-1 rounded-md border p-3 text-sm">
          <p>{fill(labels.posted, { id: posted.id })}</p>
          {posted.warnings.map(({ line, excess }) => (
            <p key={line} className="text-amber-700 dark:text-amber-400">
              {fill(labels.overReceipt, {
                line: String(line),
                excess: shownQuantity(excess),
                baseUnit: baseUnits[line],
              })}
            </p>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => setPosted(null)}>
            {labels.dismiss}
          </Button>
        </div>
      )}
    </div>
  );
}
