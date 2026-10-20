import { CustomerOrder, DOCUMENT_STATES, type DocumentState } from "./customer-orders/customer-order.entity";
import { CustomerOrderLine } from "./customer-orders/customer-order-line.entity";
import { StockBalance } from "./stock/stock-balance.entity";
import { GoodsReceipt, GOODS_RECEIPT_IMMUTABLE } from "./goods-receipts/goods-receipt.entity";
import { GoodsReceiptLine } from "./goods-receipts/goods-receipt-line.entity";
import { Shipment, SHIPMENT_STATUSES, type ShipmentStatus } from "./shipments/shipment.entity";
import { ShipmentLine } from "./shipments/shipment-line.entity";
import { GoodsIssue, GOODS_ISSUE_IMMUTABLE } from "./goods-issues/goods-issue.entity";
import { GoodsIssueLine } from "./goods-issues/goods-issue-line.entity";
import { StockMovement, STOCK_MOVEMENT_IMMUTABLE } from "./stock/stock-movement.entity";
import { API_TOKEN_NAME_MAX, ApiToken } from "./api-tokens/api-token.entity";
import {
  AUDIT_APPEND_ONLY,
  AUDIT_CHANNELS,
  type AuditChannel,
  type AuditSnapshot,
  type AuditValue,
} from "./audit/audit-event";
import { GlobalAuditEvent } from "./audit/global-audit-event.entity";
import { TenantAuditEvent } from "./audit/tenant-audit-event.entity";
import { Session } from "./auth/session.entity";
import { BomComponent } from "./boms/bom-component.entity";
import { BomRevision } from "./boms/bom-revision.entity";
import { Bom } from "./boms/bom.entity";
import { BOM_REVISION_IMMUTABLE } from "./boms/immutable-triggers";
import { GlobalIdempotencyKey } from "./idempotency/global-idempotency-key.entity";
import { IDEMPOTENCY_KEY_MAX } from "./idempotency/idempotency-key";
import { TenantIdempotencyKey } from "./idempotency/tenant-idempotency-key.entity";
import { User, USER_ROLES, type UserRole } from "./auth/user.entity";
import { MaterialConversion } from "./materials/material-conversion.entity";
import {
  Material,
  MATERIAL_DESCRIPTION_MAX,
  MATERIAL_TYPES,
  MATERIAL_UNIT_MAX,
  type MaterialType,
} from "./materials/material.entity";
import { Customer } from "./customers/customer.entity";
import { Location } from "./locations/location.entity";
import type { NamedRecord, NamedRecordEntity } from "./named-records/named-record";
import { NAMED_RECORD_NAME_MAX } from "./named-records/named-record-properties";
import { Supplier } from "./suppliers/supplier.entity";
import {
  PlanningParameterSet,
  PROCUREMENT_MODES,
  type ProcurementMode,
} from "./planning-parameters/planning-parameter-set.entity";
import { PurchaseOrderLine } from "./purchase-orders/purchase-order-line.entity";
import { PURCHASE_ORDER_STATUSES, PurchaseOrder, type PurchaseOrderStatus } from "./purchase-orders/purchase-order.entity";
import {
  PurchaseRequisition,
  REQUISITION_STATUSES,
  type RequisitionStatus,
} from "./purchase-requisitions/purchase-requisition.entity";
import { SafetyStockTarget } from "./safety-stock/safety-stock-target.entity";
import { Forecast } from "./forecasts/forecast.entity";
import { LOCALES, THEMES, UserPreference, type Locale, type Theme } from "./preferences/user-preference.entity";
import { Setting } from "./settings/setting.entity";
import { Tenant, TENANT_CODES, type TenantCode } from "./tenants/tenant.entity";
import {
  currentTenant,
  isTenantOwned,
  TENANT_FILTER,
  tenantOwned,
  TenantViolationError,
  selectTenant,
} from "./tenants/tenant-owned";

export { API_TOKEN_NAME_MAX, ApiToken, LOCALES, Session, Setting, Tenant, TENANT_CODES, THEMES, User, USER_ROLES, UserPreference };
export { AUDIT_APPEND_ONLY, AUDIT_CHANNELS, GlobalAuditEvent, TenantAuditEvent };
export { GlobalIdempotencyKey, IDEMPOTENCY_KEY_MAX, TenantIdempotencyKey };
export { Material, MATERIAL_DESCRIPTION_MAX, MATERIAL_TYPES, MATERIAL_UNIT_MAX, MaterialConversion };
export type { MaterialType };
export { CustomerOrder, CustomerOrderLine, DOCUMENT_STATES };
export type { DocumentState };
export { Customer, Location, NAMED_RECORD_NAME_MAX, Supplier };
export type { NamedRecord, NamedRecordEntity };
export { PlanningParameterSet, PROCUREMENT_MODES, SafetyStockTarget };
export { Forecast };
export { StockBalance, StockMovement, STOCK_MOVEMENT_IMMUTABLE };
export { GoodsReceipt, GOODS_RECEIPT_IMMUTABLE, GoodsReceiptLine };
export { Shipment, ShipmentLine, SHIPMENT_STATUSES, GoodsIssue, GOODS_ISSUE_IMMUTABLE, GoodsIssueLine };
export type { ShipmentStatus };
export { Bom, BomComponent, BOM_REVISION_IMMUTABLE, BomRevision };
export { PURCHASE_ORDER_STATUSES, PurchaseOrder, PurchaseOrderLine, PurchaseRequisition, REQUISITION_STATUSES };
export type { ProcurementMode, PurchaseOrderStatus, RequisitionStatus };
export type { AuditChannel, AuditSnapshot, AuditValue, Locale, TenantCode, Theme, UserRole };
export { currentTenant, isTenantOwned, TENANT_FILTER, tenantOwned, TenantViolationError, selectTenant };

/** Every entity the ORM knows about — add new ones here. */
export const entities = [
  Setting,
  User,
  Session,
  UserPreference,
  Tenant,
  ApiToken,
  GlobalAuditEvent,
  TenantAuditEvent,
  GlobalIdempotencyKey,
  TenantIdempotencyKey,
  Material,
  MaterialConversion,
  Location,
  Customer,
  Supplier,
  PlanningParameterSet,
  SafetyStockTarget,
  Bom,
  BomRevision,
  BomComponent,
  PurchaseRequisition,
  PurchaseOrder,
  PurchaseOrderLine,
  Forecast,
  CustomerOrder,
  CustomerOrderLine,
  StockBalance,
  StockMovement,
  GoodsReceipt,
  GoodsReceiptLine,
  Shipment,
  ShipmentLine,
  GoodsIssue,
  GoodsIssueLine,
];

/**
 * Entities that belong to no tenant: accounts, sessions, API tokens, preferences, settings, the
 * tenants themselves, the Global audit and the global idempotency keys. Every other entity must be declared with `tenantOwned()`
 * (enforced by tests/tenant-ownership.test.ts).
 */
export const GLOBAL_ENTITIES = [
  Setting,
  User,
  Session,
  UserPreference,
  Tenant,
  ApiToken,
  GlobalAuditEvent,
  GlobalIdempotencyKey,
];
