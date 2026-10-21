"use client";
import Link from "next/link";
import { useState } from "react";
import type { StockMovementView } from "@cpg/core";
import { stockReversalSchema } from "@cpg/core/validators/stock/stock-reversal.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { reverseStockMovement } from "../../app/admin/[tenant]/stock/actions";
import { errorFormatter, fill, shownQuantity, TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { stockFieldError, type StockLabels } from "./labels";
import { movementHref } from "./movement-link";

export type ReversalTarget = Pick<StockMovementView, "id" | "material" | "location" | "quantity" | "baseUnit" | "businessDate"> & { sourceLabel: string };
/** Keep the selected immutable posting stable even when its page refreshes behind the confirmation. */
export function ReversalDialog({ context, movement, today, labels }: { context: TenantContext; movement: ReversalTarget; today: string; labels: StockLabels }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(movement);
  const [existing, setExisting] = useState<string | null>(null);
  const target = open ? snapshot : movement;
  const t = labels.reversal;
  const inverse = target.quantity.startsWith("-") ? target.quantity.slice(1) : `-${target.quantity}`;
  const close = () => setOpen(false);
  return <Dialog open={open} onOpenChange={(next) => {
    if (next) { setSnapshot(movement); setExisting(null); }
    setOpen(next);
  }}>
    <DialogTrigger asChild><Button variant="outline" size="sm">{t.open}</Button></DialogTrigger>
    <DialogContent className={TALL_DIALOG}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
      <dl className="grid min-w-0 gap-2 rounded-md border p-3 text-sm">
        <div><dt className="text-muted-foreground">{labels.source}</dt><dd className="wrap-anywhere">{target.sourceLabel}</dd></div>
        <div><dt className="text-muted-foreground">{labels.material} / {labels.location}</dt><dd>{target.material} / {target.location}</dd></div>
        <div><dt className="text-muted-foreground">{t.original}</dt><dd>{target.businessDate} · {shownQuantity(target.quantity)} {target.baseUnit}</dd></div>
        <div><dt className="text-muted-foreground">{t.inverse}</dt><dd>{today} (UTC) · <strong className="font-mono">{shownQuantity(inverse)} {target.baseUnit}</strong></dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">{t.stockRule}</p>
      <CrudForm fields={[{ name: "reason", label: labels.reason, autoComplete: "off" }]} schema={stockReversalSchema}
        action={async (values) => {
          const result = await reverseStockMovement(context.tenant, context.generation, target.id, values);
          if (!result.ok && result.error.code === "STOCK_ALREADY_REVERSED" && typeof result.error.params?.reversal === "string") setExisting(result.error.params.reversal);
          return result;
        }}
        submitLabel={t.submit} pendingLabel={t.pending} cancelLabel={labels.form.cancel}
        formatError={errorFormatter(labels)} formatFieldError={stockFieldError(labels)} onSuccess={close} onCancel={close} />
      {existing !== null && <Link className="text-sm underline underline-offset-4" href={movementHref(context.tenant, target, existing)}>{t.viewInverse}</Link>}
      <p className="text-xs text-muted-foreground">{fill(t.lineOnly, { source: target.sourceLabel })}</p>
    </DialogContent>
  </Dialog>;
}
