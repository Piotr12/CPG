import type { EntityManager } from "@cpg/db";
import type { PreparedImport } from "../../domain/imports/prepare-import";
import { ConflictError } from "../../http/errors";
import { inRequestSavepoint } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import type { TenantInfo } from "../tenants/tenant.service";
import type { ApplyContext, ImportServices } from "./apply-context";
import { applyImport, type ImportReport } from "./apply-import";

export type { ImportChange, ImportRowOutcome } from "./apply-context";
export type { ImportReport, ImportSheetSummary } from "./apply-import";

/** What a commit says when its re-run doesn't match the dry run it names (spec Q7). */
export const IMPORT_STALE_MESSAGE =
  "Records this workbook reads or changes were edited since the dry run, or the workbook differs. Run the dry run again.";

interface Deps extends ImportServices {
  em: EntityManager;
  tenant: TenantInfo;
}

/**
 * The master-data and BOM import (E05-S01, spec `2026-10-20--0908UTC-master-data-bom-import`).
 * Resolved from a tenant scope and called inside that request's write transaction (a tenant server
 * action, or a keyed API write), with a workbook `prepareImport` already read. Both methods run the
 * same apply pass through the master services in a savepoint: the dry run always rolls it back, and
 * the commit keeps it only when it matches the dry run's preview token. Every change is audited by
 * its service (Q15); the admin check is the caller's.
 */
export class ImportService {
  private readonly em: EntityManager;
  private readonly tenant: TenantInfo;
  private readonly services: ImportServices;

  // Each dependency by name: a rest spread would enumerate the whole PROXY cradle, this service included.
  constructor({
    em,
    tenant,
    materialService,
    locationService,
    customerService,
    supplierService,
    planningParameterService,
    safetyStockTargetService,
    bomService,
  }: Deps) {
    this.em = em;
    this.tenant = tenant;
    this.services = {
      materialService,
      locationService,
      customerService,
      supplierService,
      planningParameterService,
      safetyStockTargetService,
      bomService,
    };
  }

  /** Every error, or what each row would do and the token a commit needs (XLS-009…011). Nothing persists (XLS-010). */
  async dryRun(prepared: PreparedImport, actor: AuditActor): Promise<ImportReport> {
    return inRequestSavepoint(this.em, async () => ({ committed: false, ...(await this.apply(prepared, actor)) }), { keep: false });
  }

  /**
   * Applies the workbook in one go, or nothing (XLS-012…014): the re-run must find no error and
   * compute the token the dry run returned, or it is `IMPORT_STALE` and everything rolls back.
   */
  async commit(prepared: PreparedImport, token: string, actor: AuditActor): Promise<ImportReport> {
    return inRequestSavepoint(
      this.em,
      async () => {
        const report = await this.apply(prepared, actor);
        if (report.previewToken !== token) throw new ConflictError(IMPORT_STALE_MESSAGE, "IMPORT_STALE");
        return { ...report, committed: true, previewToken: null };
      },
      { keep: true },
    );
  }

  private apply(prepared: PreparedImport, actor: AuditActor) {
    const context: ApplyContext = {
      em: this.em,
      services: this.services,
      actor,
      tenantName: this.tenant.name,
      errors: [],
      outcomes: [],
      versions: [],
    };
    return applyImport(context, prepared, this.tenant.generation);
  }
}
