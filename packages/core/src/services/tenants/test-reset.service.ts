import { currentTenant, resetTestData, Tenant, TenantViolationError, type EntityManager } from "@cpg/db";
import { assertCurrentGeneration } from "../../domain/tenants/generation";
import { ConflictError } from "../../http/errors";
import { inRequestSavepoint, inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { MAX_DATASET_GENERATION } from "../../validators/tenants/test-reset.schema";
import type { AuditActor } from "../audit/actor";
import { recordGlobalAudit } from "../audit/audit-recorder";
import { seedResetDemoData, type DemoServices } from "../demo/seed-demo-data";
import type { TenantInfo, TenantService } from "./tenant.service";

interface Deps extends DemoServices { em: EntityManager; tenantService: TenantService }

/** The admin's atomic Test reset. Callers authorize; the service owns transaction and scope safety. */
export class TestResetService {
  private readonly em: EntityManager;
  private readonly tenantService: TenantService;
  private readonly seeds: DemoServices;

  constructor({ em, tenantService, materialService, locationService, customerService, supplierService, planningParameterService, safetyStockTargetService, bomService, stockService, customerOrderService }: Deps) {
    this.em = em;
    this.tenantService = tenantService;
    this.seeds = { materialService, locationService, customerService, supplierService, planningParameterService, safetyStockTargetService, bomService, stockService, customerOrderService };
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
    await seedResetDemoData(this.seeds);
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
