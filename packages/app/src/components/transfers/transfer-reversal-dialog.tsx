"use client";
import Link from "next/link";
import type { TransferPostingKind } from "@cpg/core";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { reverseTransferPosting } from "../../app/admin/[tenant]/transfers/[id]/actions";
import { ReversalConfirmDialog } from "../stock/reversal-confirm-dialog";
import { errorFormatter, fill, type TenantContext, type TransfersLabels } from "./labels";

/** A posting as its confirmation shows it; built by the server-rendered ledger, so plain data only. */
export interface TransferReversalTarget {
  id: string; kind: TransferPostingKind; businessDate: string;
  /** The reversal's changes, each a place and its signed quantity with the unit. */
  changes: { place: string; quantity: string }[];
}

/** Reverses one posting of a transfer in full (E11-S03) through the shared confirmation; the posting is bound when it opens. */
export function TransferReversalDialog({ context, transfer, posting, today, existingHref, labels }: {
  context: TenantContext; transfer: string; posting: TransferReversalTarget; today: string; existingHref: string; labels: TransfersLabels;
}) {
  const t = labels.reversal;
  return <ReversalConfirmDialog target={posting}
    labels={{ open: t.open, title: t.titles[posting.kind], description: t.description, reason: t.reason, submit: t.submit, pending: t.pending, cancel: t.cancel }}
    summary={(target) => <>
      <dl className="grid min-w-0 gap-2 rounded-md border p-3 text-sm">
        <div><dt className="text-muted-foreground">{t.original}</dt><dd>{labels.ledger.kinds[target.kind]} · {target.businessDate}</dd></div>
        <div><dt className="text-muted-foreground">{t.date}</dt><dd>{fill(t.today, { date: today })}</dd></div>
        <div><dt className="text-muted-foreground">{t.changes}</dt>
          <dd><ul className="mt-1 flex flex-col gap-1">{target.changes.map((change) =>
            <li key={change.place} className="flex flex-wrap justify-between gap-2"><span className="wrap-anywhere">{change.place}</span><strong className="font-mono">{change.quantity}</strong></li>)}</ul></dd></div>
      </dl>
      <p className="text-sm">{t.effect}</p>
      <p className="text-sm text-muted-foreground">{t.stockRule}</p>
    </>}
    action={(target, values) => reverseTransferPosting(context.tenant, context.generation, transfer, target.id, values)}
    formatError={errorFormatter(labels)}
    formatFieldError={(message) => message === STOCK_REASON_MESSAGE ? t.reasonError : message}
    afterRefusal={(_, error) => error.code === "TRANSFER_POSTING_ALREADY_REVERSED"
      ? <Link className="text-sm underline underline-offset-4" href={existingHref}>{t.showExisting}</Link>
      : null} />;
}
