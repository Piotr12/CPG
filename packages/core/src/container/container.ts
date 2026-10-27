import { StockReversalService } from "../services/stock/stock-reversal.service";
import { ProductionOrderService } from "../services/production-orders/production-order.service";
import { ProductionCompletionService } from "../services/production-orders/production-completion.service";
import { CustomerOrderService } from "../services/customer-orders/customer-order.service";
import { StockService } from "../services/stock/stock.service";
import { DemandReviewService } from "../services/reports/demand-review.service";
import { MrpRunService } from "../services/mrp/mrp-run.service";
import { MrpSnapshotService } from "../services/mrp/mrp-snapshot.service";
import { StockReportService } from "../services/reports/stock-report.service";
import { VarianceReportService } from "../services/reports/variance-report.service";
import { entities, initOrm, type Orm } from "@cpg/db";
import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import { TEST_DATASET_CONFIGS } from "../domain/demo/test-datasets";
import { loadConfig, type AppConfig } from "../config";
import { toDbOptions } from "../database";
import { ApiTokenService } from "../services/api-tokens/api-token.service";
import { AuditService } from "../services/audit/audit.service";
import { AuthService } from "../services/auth/auth.service";
import { LoginThrottle } from "../services/auth/login-throttle";
import { IdempotencyService } from "../services/idempotency/idempotency.service";
import { CustomerService } from "../services/customers/customer.service";
import { LocationService } from "../services/locations/location.service";
import { BomService } from "../services/boms/bom.service";
import { ImportService } from "../services/imports/import.service";
import { StockImportService } from "../services/imports/stock-import.service";
import { PlanningParameterService } from "../services/planning-parameters/planning-parameter.service";
import { SafetyStockTargetService } from "../services/safety-stock/safety-stock-target.service";
import { PurchaseOrderService } from "../services/purchase-orders/purchase-order.service";
import { GoodsReceiptService } from "../services/goods-receipts/goods-receipt.service";
import { TransferService } from "../services/transfers/transfer.service";
import { GoodsIssueService } from "../services/goods-issues/goods-issue.service";
import { ShipmentService } from "../services/shipments/shipment.service";
import { PurchaseRequisitionService } from "../services/purchase-requisitions/purchase-requisition.service";
import { ForecastService } from "../services/forecasts/forecast.service";
import { MaterialService } from "../services/materials/material.service";
import { SupplierService } from "../services/suppliers/supplier.service";
import { UserPreferenceService } from "../services/preferences/user-preference.service";
import { SystemStatusService } from "../services/system/system-status.service";
import { UserService } from "../services/users/user.service";
import { TestResetService } from "../services/tenants/test-reset.service";
import { TenantService } from "../services/tenants/tenant.service";
import { globalSingleton } from "../singleton";
import type { AppContainer, Cradle } from "./cradle";

/**
 * The composition root: every dependency is registered here by hand, one line each — no
 * auto-discovery. PROXY mode resolves dependencies by destructuring the cradle
 * (`({ orm, config }) => ...`), so it keeps working after the production build minifies parameter
 * names — CLASSIC mode would not.
 */
export function createAppContainer(config: AppConfig, orm: Orm): AppContainer {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    testDatasets: asValue(TEST_DATASET_CONFIGS),
    orm: asValue(orm),
    em: asFunction(({ orm }: { orm: Orm }) => orm.em.fork()).scoped(),
    systemStatusService: asClass(SystemStatusService).scoped(),
    // One per process (per bundle): its failure counters must outlive the request.
    loginThrottle: asClass(LoginThrottle).singleton(),
    authService: asClass(AuthService).scoped(),
    userService: asClass(UserService).scoped(),
    userPreferenceService: asClass(UserPreferenceService).scoped(),
    tenantService: asClass(TenantService).scoped(),
    testResetService: asClass(TestResetService).scoped(),
    apiTokenService: asClass(ApiTokenService).scoped(),
    auditService: asClass(AuditService).scoped(),
    idempotencyService: asClass(IdempotencyService).scoped(),
    // Tenant data: resolve it from a tenantScope(), whose `em` reads and writes one tenant only.
    stockService: asClass(StockService).scoped(),
    stockReversalService: asClass(StockReversalService).scoped(),
    materialService: asClass(MaterialService).scoped(),
    locationService: asClass(LocationService).scoped(),
    customerService: asClass(CustomerService).scoped(),
    supplierService: asClass(SupplierService).scoped(),
    planningParameterService: asClass(PlanningParameterService).scoped(),
    safetyStockTargetService: asClass(SafetyStockTargetService).scoped(),
    forecastService: asClass(ForecastService).scoped(),
    bomService: asClass(BomService).scoped(),
    purchaseRequisitionService: asClass(PurchaseRequisitionService).scoped(),
    purchaseOrderService: asClass(PurchaseOrderService).scoped(),
    goodsReceiptService: asClass(GoodsReceiptService).scoped(),
    productionOrderService: asClass(ProductionOrderService).scoped(),
    productionCompletionService: asClass(ProductionCompletionService).scoped(),
    transferService: asClass(TransferService).scoped(),
    shipmentService: asClass(ShipmentService).scoped(),
    goodsIssueService: asClass(GoodsIssueService).scoped(),
    customerOrderService: asClass(CustomerOrderService).scoped(),
    importService: asClass(ImportService).scoped(),
    stockImportService: asClass(StockImportService).scoped(),
    demandReviewService: asClass(DemandReviewService).scoped(),
    mrpSnapshotService: asClass(MrpSnapshotService).scoped(),
    mrpRunService: asClass(MrpRunService).scoped(),
    stockReportService: asClass(StockReportService).scoped(),
    varianceReportService: asClass(VarianceReportService).scoped(),
    // `tenant` is registered only by tenantScope(): resolving it from a global scope fails (strict).
  });
  return container;
}

/**
 * The process-wide container. The database is migrated at startup by the app's
 * `instrumentation.ts`. Server-only — never import this from a client component.
 *
 * Keyed by the `entities` array, not a name: Next.js bundles route handlers and pages separately,
 * each with its own copy of `@cpg/core` and `@cpg/db`, and MikroORM matches entities by object
 * identity. So every copy gets its own container (and SQLite connection) built from the entities
 * it will query with.
 */
export function getContainer(): Promise<AppContainer> {
  return globalSingleton(entities, async () => {
    const config = loadConfig();
    return createAppContainer(config, await initOrm(toDbOptions(config)));
  });
}

/** A per-request child scope: scoped registrations (like `em`) get a fresh instance each time. */
export async function requestScope(): Promise<AppContainer> {
  return (await getContainer()).createScope();
}
