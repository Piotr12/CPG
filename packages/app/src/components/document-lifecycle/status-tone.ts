import type { TargetStatus } from "@cpg/core";
import type { StatusTone } from "@cpg/ui/backend/feedback/status-badge";
import { Circle, CircleCheck, CircleDot, CircleMinus, CircleOff, CircleX, Clock, History, Lock, Pencil, Truck, Undo2, type LucideIcon } from "lucide-react";

/** How a status renders in a `StatusBadge`: colour marks attention and completion, resting states stay quiet (D4). */
export interface StatusToneSpec {
  tone: StatusTone;
  icon: LucideIcon;
  dashed?: boolean;
}

/**
 * The shared four-state lifecycle, `DOCUMENT_STATES` in `db/src/entities/customer-orders/customer-order.entity.ts`
 * (`app` must not import `@cpg/db`). Production orders, purchase orders and their lines (`completed` reads
 * "Received" on a line), `REQUISITION_STATUSES`, `TRANSFER_STATUSES` and `PURCHASE_ORDER_STATUSES` all use it;
 * `SHIPMENT_STATUSES` is its subset `open | completed | cancelled`.
 */
export type DocumentStatus = "open" | "completed" | "closed-early" | "cancelled";

/** A transfer's status, plus `inTransit`: dispatched stock not yet received or written off. */
export type TransferStatusView = DocumentStatus | "inTransit";

/** A stock movement or production completion that has been reversed; one that hasn't shows no status. */
export type ReversalStatus = "reversed";

/** A master record (material, location, customer, supplier, BOM, user). */
export type MasterDataStatus = "active" | "inactive";

/** Whether a tenant accepts business writes. */
export type TenantAccess = "readOnly" | "writable";

export const DOCUMENT_STATUS_TONES = {
  open: { tone: "neutral", icon: CircleDot },
  completed: { tone: "success", icon: CircleCheck },
  "closed-early": { tone: "warning", icon: CircleMinus },
  cancelled: { tone: "neutral", icon: CircleX },
} as const satisfies Record<DocumentStatus, StatusToneSpec>;

export const TRANSFER_STATUS_TONES = {
  ...DOCUMENT_STATUS_TONES,
  inTransit: { tone: "neutral", icon: Truck },
} as const satisfies Record<TransferStatusView, StatusToneSpec>;

export const REVERSAL_STATUS_TONES = {
  reversed: { tone: "neutral", icon: Undo2 },
} as const satisfies Record<ReversalStatus, StatusToneSpec>;

export const TARGET_STATUS_TONES = {
  inEffect: { tone: "success", icon: CircleCheck },
  scheduled: { tone: "neutral", icon: Clock },
  superseded: { tone: "neutral", icon: History },
} as const satisfies Record<TargetStatus, StatusToneSpec>;

export const MASTER_DATA_STATUS_TONES = {
  active: { tone: "neutral", icon: Circle },
  inactive: { tone: "neutral", icon: CircleOff, dashed: true },
} as const satisfies Record<MasterDataStatus, StatusToneSpec>;

export const TENANT_ACCESS_TONES = {
  readOnly: { tone: "warning", icon: Lock },
  writable: { tone: "neutral", icon: Pencil },
} as const satisfies Record<TenantAccess, StatusToneSpec>;

export const documentStatusTone = (status: DocumentStatus): StatusToneSpec => DOCUMENT_STATUS_TONES[status];
export const transferStatusTone = (status: TransferStatusView): StatusToneSpec => TRANSFER_STATUS_TONES[status];
export const reversalStatusTone = (status: ReversalStatus): StatusToneSpec => REVERSAL_STATUS_TONES[status];
export const targetStatusTone = (status: TargetStatus): StatusToneSpec => TARGET_STATUS_TONES[status];
export const masterDataStatusTone = (active: boolean): StatusToneSpec => MASTER_DATA_STATUS_TONES[active ? "active" : "inactive"];
export const tenantAccessTone = (readOnly: boolean): StatusToneSpec => TENANT_ACCESS_TONES[readOnly ? "readOnly" : "writable"];
