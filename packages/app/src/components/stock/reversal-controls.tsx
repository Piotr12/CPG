import Link from "next/link";
import { Badge } from "@cpg/ui/components/badge";
import type { StockLabels } from "./labels";
import { movementHref } from "./movement-link";
import { ReversalDialog, type ReversalTarget } from "./reversal-dialog";

/** The same history links and full-line command on the ledger and immutable source document. */
export function ReversalControls({ tenant, movement, reversedBy, reverses, canReverse, labels }: {
  tenant: { code: string; generation: number; readOnly: boolean }; movement: ReversalTarget;
  reversedBy: string | null; reverses: string | null; canReverse: boolean; labels: StockLabels;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    {reversedBy !== null && <><Badge variant="outline">{labels.reversal.reversed}</Badge><Link className="text-xs underline underline-offset-4" href={movementHref(tenant.code, movement, reversedBy)}>{labels.reversal.viewInverse}</Link></>}
    {reverses !== null && <Link className="text-xs underline underline-offset-4" href={movementHref(tenant.code, movement, reverses)}>{labels.reversal.viewOriginal}</Link>}
    {canReverse && !tenant.readOnly && <ReversalDialog context={{ tenant: tenant.code, generation: tenant.generation }} movement={movement} today={new Date().toISOString().slice(0, 10)} labels={labels} />}
  </div>;
}
