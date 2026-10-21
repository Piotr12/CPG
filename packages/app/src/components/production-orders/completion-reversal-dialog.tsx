"use client";
import Link from "next/link";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { reverseProductionCompletion } from "../../app/admin/[tenant]/production-orders/actions";
import { errorFormatter, fill, type TenantContext } from "../forms/form-labels";
import { ReversalConfirmDialog } from "../stock/reversal-confirm-dialog";
import type { ProductionLabels } from "./labels";

/** One stock change the reversal will post, as plain text: what, where, signed quantity. */
export interface ReversalLeg { label: string; quantity: string }

/** A completion as its confirmation shows it; built by the server-rendered history, so plain data only. */
export interface CompletionReversalTarget {
  id: string; businessDate: string; output: string; location: string; legs: ReversalLeg[];
  produced: string; quantity: string; unit: string;
}

/** Reverses one whole completion (E11-S03) through the shared confirmation; the order and completion are bound when it opens. */
export function CompletionReversalDialog({ context, order, completion, today, existingHref, labels }: {
  context: TenantContext; order: string; completion: CompletionReversalTarget; today: string; existingHref: string; labels: ProductionLabels;
}) {
  const t = labels.completion.reversal;
  return <ReversalConfirmDialog target={completion}
    labels={{ open: t.open, openLabel: fill(t.openLabel, { id: completion.id }), title: fill(t.title, { id: completion.id }), description: t.description, reason: t.reason, submit: t.submit, pending: t.pending, cancel: t.cancel }}
    summary={(target) => <>
      <dl className="grid min-w-0 gap-2 rounded-md border p-3 text-sm">
        <div><dt className="text-muted-foreground">{t.original}</dt><dd>{target.businessDate} · {target.output}</dd></div>
        <div><dt className="text-muted-foreground">{t.date}</dt><dd>{fill(t.today, { date: today })}</dd></div>
        <div><dt className="text-muted-foreground">{fill(t.changes, { location: target.location })}</dt>
          <dd><ul className="mt-1 flex flex-col gap-1">{target.legs.map((leg) =>
            <li key={leg.label} className="flex flex-wrap justify-between gap-2"><span className="wrap-anywhere">{leg.label}</span><strong className="font-mono">{leg.quantity}</strong></li>)}</ul></dd></div>
      </dl>
      <p className="text-sm">{fill(t.effect, { produced: target.produced, output: target.quantity, unit: target.unit })}</p>
      <p className="text-sm text-muted-foreground">{t.stockRule}</p>
    </>}
    action={(target, values) => reverseProductionCompletion(context.tenant, context.generation, order, target.id, values)}
    formatError={errorFormatter(labels)}
    formatFieldError={(message) => message === STOCK_REASON_MESSAGE ? t.reasonError : message}
    afterRefusal={(_, error) => error.code === "PRODUCTION_COMPLETION_ALREADY_REVERSED"
      ? <Link className="text-sm underline underline-offset-4" href={existingHref}>{t.showExisting}</Link>
      : null} />;
}
