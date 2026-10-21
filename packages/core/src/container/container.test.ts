import { StockReversalService } from "../services/stock/stock-reversal.service";
import { ProductionOrderService } from "../services/production-orders/production-order.service";
import { ProductionCompletionService } from "../services/production-orders/production-completion.service";
import { CustomerOrderService } from "../services/customer-orders/customer-order.service";
import { StockService } from "../services/stock/stock.service";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entities, initOrm, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { toDbOptions } from "../database";
import { ApiTokenService } from "../services/api-tokens/api-token.service";
import { AuditService } from "../services/audit/audit.service";
import { AuthService } from "../services/auth/auth.service";
import { LoginThrottle } from "../services/auth/login-throttle";
import { PurchaseOrderService } from "../services/purchase-orders/purchase-order.service";
import { GoodsReceiptService } from "../services/goods-receipts/goods-receipt.service";
import { TransferService } from "../services/transfers/transfer.service";
import { GoodsIssueService } from "../services/goods-issues/goods-issue.service";
import { ShipmentService } from "../services/shipments/shipment.service";
import { PurchaseRequisitionService } from "../services/purchase-requisitions/purchase-requisition.service";
import { BomService } from "../services/boms/bom.service";
import { CustomerService } from "../services/customers/customer.service";
import { LocationService } from "../services/locations/location.service";
import { PlanningParameterService } from "../services/planning-parameters/planning-parameter.service";
import { SafetyStockTargetService } from "../services/safety-stock/safety-stock-target.service";
import { ForecastService } from "../services/forecasts/forecast.service";
import { MaterialService } from "../services/materials/material.service";
import { SupplierService } from "../services/suppliers/supplier.service";
import { UserPreferenceService } from "../services/preferences/user-preference.service";
import { SystemStatusService } from "../services/system/system-status.service";
import { TestResetService } from "../services/tenants/test-reset.service";
import { UserService } from "../services/users/user.service";
import { createAppContainer, getContainer, requestScope } from "./container";

describe("createAppContainer", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-container-")) });
  let orm: Orm;

  beforeAll(async () => {
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());

  it("registers the config, the ORM and the services", () => {
    const { cradle } = createAppContainer(config, orm);

    expect(cradle.config).toBe(config);
    expect(cradle.orm).toBe(orm);
    expect(cradle.systemStatusService).toBeInstanceOf(SystemStatusService);
    expect(cradle.authService).toBeInstanceOf(AuthService);
    expect(cradle.loginThrottle).toBeInstanceOf(LoginThrottle);
    expect(cradle.userService).toBeInstanceOf(UserService);
    expect(cradle.userPreferenceService).toBeInstanceOf(UserPreferenceService);
    expect(cradle.apiTokenService).toBeInstanceOf(ApiTokenService);
    expect(cradle.auditService).toBeInstanceOf(AuditService);
    expect(cradle.stockService).toBeInstanceOf(StockService);
    expect(cradle.stockReversalService).toBeInstanceOf(StockReversalService);
    expect(cradle.materialService).toBeInstanceOf(MaterialService);
    expect(cradle.locationService).toBeInstanceOf(LocationService);
    expect(cradle.planningParameterService).toBeInstanceOf(PlanningParameterService);
    expect(cradle.safetyStockTargetService).toBeInstanceOf(SafetyStockTargetService);
    expect(cradle.forecastService).toBeInstanceOf(ForecastService);
    expect(cradle.bomService).toBeInstanceOf(BomService);
    expect(cradle.purchaseRequisitionService).toBeInstanceOf(PurchaseRequisitionService);
    expect(cradle.productionOrderService).toBeInstanceOf(ProductionOrderService);
    expect(cradle.productionCompletionService).toBeInstanceOf(ProductionCompletionService);
    expect(cradle.purchaseOrderService).toBeInstanceOf(PurchaseOrderService);
    expect(cradle.goodsReceiptService).toBeInstanceOf(GoodsReceiptService);
    expect(cradle.transferService).toBeInstanceOf(TransferService);
    expect(cradle.shipmentService).toBeInstanceOf(ShipmentService);
    expect(cradle.goodsIssueService).toBeInstanceOf(GoodsIssueService);
    expect(cradle.customerOrderService).toBeInstanceOf(CustomerOrderService);
    expect(cradle.customerService).toBeInstanceOf(CustomerService);
    expect(cradle.supplierService).toBeInstanceOf(SupplierService);
    expect(cradle.testResetService).toBeInstanceOf(TestResetService);
  });

  it("shares one login throttle across request scopes", () => {
    const container = createAppContainer(config, orm);

    expect(container.createScope().cradle.loginThrottle).toBe(container.createScope().cradle.loginThrottle);
  });

  it("gives every scope its own EntityManager fork", () => {
    const container = createAppContainer(config, orm);
    const first = container.createScope();
    const second = container.createScope();

    expect(first.cradle.em).toBe(first.cradle.em);
    expect(first.cradle.em).not.toBe(second.cradle.em);
    expect(first.cradle.em).not.toBe(orm.em);
  });

  it("rejects unregistered dependencies (strict mode)", () => {
    const container = createAppContainer(config, orm);

    expect(() => container.resolve("missing" as never)).toThrow();
  });
});

describe("getContainer / requestScope", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => (await getContainer()).cradle.orm.close());

  it("builds one container from the environment and hands out request scopes", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-global-"));
    vi.stubEnv("DATA_DIR", dataDir);

    const container = await getContainer();
    const scope = await requestScope();

    expect(await getContainer()).toBe(container);
    expect(container.cradle.config.dataDir).toBe(dataDir);
    expect(container.cradle.orm.config.get("entities")).toBe(entities);
    expect(scope).not.toBe(container);
    expect(scope.cradle.em).not.toBe((await requestScope()).cradle.em);
  });
});
