import type { ProductionOrderService } from "../services/production-orders/production-order.service";
import type { ProductionCompletionService } from "../services/production-orders/production-completion.service";
import type { CustomerOrderService } from "../services/customer-orders/customer-order.service";
import type { TestResetService } from "../services/tenants/test-reset.service";
import type { StockService } from "../services/stock/stock.service";
import type { StockReportService } from "../services/reports/stock-report.service";
import type { EntityManager, Orm } from "@cpg/db";
import type { AwilixContainer } from "awilix";
import type { AppConfig } from "../config";
import type { ApiTokenService } from "../services/api-tokens/api-token.service";
import type { AuditService } from "../services/audit/audit.service";
import type { AuthService } from "../services/auth/auth.service";
import type { LoginThrottle } from "../services/auth/login-throttle";
import type { IdempotencyService } from "../services/idempotency/idempotency.service";
import type { CustomerService } from "../services/customers/customer.service";
import type { LocationService } from "../services/locations/location.service";
import type { BomService } from "../services/boms/bom.service";
import type { ImportService } from "../services/imports/import.service";
import type { StockImportService } from "../services/imports/stock-import.service";
import type { PlanningParameterService } from "../services/planning-parameters/planning-parameter.service";
import type { SafetyStockTargetService } from "../services/safety-stock/safety-stock-target.service";
import type { PurchaseOrderService } from "../services/purchase-orders/purchase-order.service";
import type { GoodsReceiptService } from "../services/goods-receipts/goods-receipt.service";
import type { TransferService } from "../services/transfers/transfer.service";
import type { GoodsIssueService } from "../services/goods-issues/goods-issue.service";
import type { ShipmentService } from "../services/shipments/shipment.service";
import type { PurchaseRequisitionService } from "../services/purchase-requisitions/purchase-requisition.service";
import type { ForecastService } from "../services/forecasts/forecast.service";
import type { MaterialService } from "../services/materials/material.service";
import type { SupplierService } from "../services/suppliers/supplier.service";
import type { UserPreferenceService } from "../services/preferences/user-preference.service";
import type { SystemStatusService } from "../services/system/system-status.service";
import type { UserService } from "../services/users/user.service";
import type { TenantInfo, TenantService } from "../services/tenants/tenant.service";

/** Everything the DI container can resolve — one entry per registration in `container.ts`. */
export interface Cradle {
  config: AppConfig;
  orm: Orm;
  /** A fresh EntityManager fork per container scope (i.e. per request). */
  em: EntityManager;
  systemStatusService: SystemStatusService;
  loginThrottle: LoginThrottle;
  authService: AuthService;
  userService: UserService;
  userPreferenceService: UserPreferenceService;
  tenantService: TenantService;
  testResetService: TestResetService;
  apiTokenService: ApiTokenService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
  stockService: StockService;
  materialService: MaterialService;
  locationService: LocationService;
  customerService: CustomerService;
  supplierService: SupplierService;
  planningParameterService: PlanningParameterService;
  safetyStockTargetService: SafetyStockTargetService;
  forecastService: ForecastService;
  bomService: BomService;
  purchaseRequisitionService: PurchaseRequisitionService;
  purchaseOrderService: PurchaseOrderService;
  goodsReceiptService: GoodsReceiptService;
  productionOrderService: ProductionOrderService;
  productionCompletionService: ProductionCompletionService;
  transferService: TransferService;
  shipmentService: ShipmentService;
  goodsIssueService: GoodsIssueService;
  customerOrderService: CustomerOrderService;
  importService: ImportService;
  stockImportService: StockImportService;
  stockReportService: StockReportService;
  /** The active tenant. Only in scopes built by `tenantScope()`. */
  tenant: TenantInfo;
}

export type AppContainer = AwilixContainer<Cradle>;
