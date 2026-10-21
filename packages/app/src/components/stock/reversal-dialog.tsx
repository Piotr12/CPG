"use client";
import Link from "next/link";
import type { StockMovementView } from "@cpg/core";
import { reverseStockMovement } from "../../app/admin/[tenant]/stock/actions";
import { errorFormatter, fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { stockFieldError, type StockLabels } from "./labels";
import { movementHref } from "./movement-link";
import { ReversalConfirmDialog } from "./reversal-confirm-dialog";

export type ReversalTarget = Pick<StockMovementView, "id" | "material" | "location" | "quantity" | "baseUnit" | "businessDate"> & { sourceLabel: string };
/** One ledger line's full inverse (#91), through the shared confirmation. */
export function ReversalDialog({ context, movement, today, labels }: { context: TenantContext; movement: ReversalTarget; today: string; labels: StockLabels }) {
  const t = labels.reversal;
  return <ReversalConfirmDialog target={movement}
    labels={{ open: t.open, title: t.title, description: t.description, reason: labels.reason, submit: t.submit, pending: t.pending, cancel: labels.form.cancel }}
    summary={(target) => {
      const inverse = target.quantity.startsWith("-") ? target.quantity.slice(1) : `-${target.quantity}`;
      return <>
        <dl className="grid min-w-0 gap-2 rounded-md border p-3 text-sm">
          <div><dt className="text-muted-foreground">{labels.source}</dt><dd className="wrap-anywhere">{target.sourceLabel}</dd></div>
          <div><dt className="text-muted-foreground">{labels.material} / {labels.location}</dt><dd>{target.material} / {target.location}</dd></div>
          <div><dt className="text-muted-foreground">{t.original}</dt><dd>{target.businessDate} · {shownQuantity(target.quantity)} {target.baseUnit}</dd></div>
          <div><dt className="text-muted-foreground">{t.inverse}</dt><dd>{today} (UTC) · <strong className="font-mono">{shownQuantity(inverse)} {target.baseUnit}</strong></dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">{t.stockRule}</p>
      </>;
    }}
    footnote={(target) => <p className="text-xs text-muted-foreground">{fill(t.lineOnly, { source: target.sourceLabel })}</p>}
    action={(target, values) => reverseStockMovement(context.tenant, context.generation, target.id, values)}
    formatError={errorFormatter(labels)} formatFieldError={stockFieldError(labels)}
    afterRefusal={(target, error) => error.code === "STOCK_ALREADY_REVERSED" && typeof error.params?.reversal === "string"
      ? <Link className="text-sm underline underline-offset-4" href={movementHref(context.tenant, target, error.params.reversal)}>{t.viewInverse}</Link>
      : null} />;
}
