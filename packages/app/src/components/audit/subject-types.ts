import type { Messages } from "../../i18n/messages/en";

/** A record type an audit entry can be about: its subject type, named in both languages. */
export type AuditSubjectType = keyof Messages["audit"]["subjects"];

/** The record types the Global audit holds: accounts, their tokens and the tenants' settings. */
export const GLOBAL_SUBJECT_TYPES = ["User", "ApiToken", "Tenant"] as const satisfies readonly AuditSubjectType[];

/** The record types a tenant audit holds, in the order the sidebar lists their screens. */
export const TENANT_SUBJECT_TYPES = [
  "Material",
  "MaterialConversion",
  "Location",
  "Customer",
  "Supplier",
  "PlanningParameterSet",
  "SafetyStockTarget",
  "Forecast",
  "Bom",
  "PurchaseRequisition",
  "PurchaseOrder",
  "GoodsReceipt",
  "CustomerOrder",
  "Shipment",
  "GoodsIssue",
  "StockMovement",
  "Transfer",
  "ProductionOrder",
  "ProductionCompletion",
  "MrpRun",
] as const satisfies readonly AuditSubjectType[];
