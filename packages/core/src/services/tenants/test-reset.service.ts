import { currentTenant, resetTestData, Tenant, TenantViolationError, type EntityManager } from "@cpg/db";
import { assertCurrentGeneration } from "../../domain/tenants/generation";
import { ConflictError } from "../../http/errors";
import { inRequestSavepoint, inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { MAX_DATASET_GENERATION } from "../../validators/tenants/test-reset.schema";
import type { AuditActor } from "../audit/actor";
import { recordGlobalAudit } from "../audit/audit-recorder";
import { seedTestTenantDataset, type DatasetServices } from "../demo/seed-demo-data";
import type { TenantInfo, TenantService } from "./tenant.service";

interface Deps extends DatasetServices { tenantService: TenantService }

/**
 * The admin's atomic Test reset: deletes Test's data, then writes the dataset generated for today
 * (spec `2026-10-21--0718UTC-test-tenant-dataset`), so IDs restart at 00000001. Callers authorize;
 * the service owns transaction and scope safety.
 */
export class TestResetService {
  private readonly em: EntityManager;
  private readonly tenantService: TenantService;
  private readonly seeds: DatasetServices;

  // Each dependency by name: taking the rest of a PROXY cradle would resolve every registration (lesson of 2026-10-20).
  constructor({
    em, testTenantConfig, tenantService, materialService, locationService, customerService, supplierService, planningParameterService, safetyStockTargetService,
    bomService, forecastService, stockService, customerOrderService, shipmentService, goodsIssueService, purchaseRequisitionService,
    purchaseOrderService, goodsReceiptService, productionOrderService, productionCompletionService,
  }: Deps) {
    this.em = em;
    this.tenantService = tenantService;
    this.seeds = {
      em, testTenantConfig, materialService, locationService, customerService, supplierService, planningParameterService, safetyStockTargetService, bomService,
      forecastService, stockService, customerOrderService, shipmentService, goodsIssueService, purchaseRequisitionService, purchaseOrderService,
      goodsReceiptService, productionOrderService, productionCompletionService,
    };
  }

  async reset(expectedGeneration: number, actor: AuditActor): Promise<TenantInfo> {
    if (currentTenant(this.em) !== "test") throw new TenantViolationError("reset requires a Test scope");
    const work = () => inRequestSavepoint(this.em, () => this.replace(expectedGeneration, actor), { keep: true });
    // API already owns the transaction and retries; direct UI calls need the same outer boundary.
    return this.em.isInTransaction() ? work() : retryingStaleSnapshot(() => inRequestTransaction(this.em, work));
  }

  private async replace(expectedGeneration: number, actor: AuditActor): Promise<TenantInfo> {
    const before = await this.tenantService.currentState("test");
    assertCurrentGeneration(before.generation, expectedGeneration, true);
    if (before.generation >= MAX_DATASET_GENERATION) throw new ConflictError("Test has reached its last dataset generation.", "GENERATION_EXHAUSTED");
    // A real update even when already read-only: acquire the cross-connection writer lock.
    await this.em.nativeUpdate(Tenant, { code: "test" }, { readOnly: true });
    await resetTestData(this.em);
    await this.em.nativeUpdate(Tenant, { code: "test" }, { generation: before.generation + 1, readOnly: false });
    // The dataset generated for today, through the services; any refusal or shortfall throws and the savepoint undoes it all.
    await seedTestTenantDataset(this.seeds, new Date());
    await this.em.nativeUpdate(Tenant, { code: "test" }, { readOnly: before.readOnly });
    // Seed reads may have cached the temporary writable metadata; always return its fresh state.
    const after = await this.tenantService.currentState("test");
    recordGlobalAudit(this.em, actor, {
      action: "tenants.tenant.reset",
      subject: { type: "Tenant", id: "test", label: "Test" },
      before: { generation: before.generation, readOnly: before.readOnly },
      after: { generation: after.generation, readOnly: after.readOnly },
    });
    return { code: "test", name: "Test", ...after };
  }
}
