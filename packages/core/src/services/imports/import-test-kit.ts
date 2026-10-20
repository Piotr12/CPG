import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, TenantAuditEvent, type Orm, type TenantCode } from "@cpg/db";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer, Cradle } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import type { Cell, WorkbookSheet } from "../../domain/imports/cells";
import { prepareImport } from "../../domain/imports/prepare-import";
import { sheetSpec, type SheetKey } from "../../domain/imports/workbook-layout";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import type { ImportReport } from "./apply-import";

/*
 * Test helpers for the import's integration tests: a fresh database per test (the audit is
 * append-only, so nothing can be cleaned between tests), workbooks built from rows, and the dry run
 * and commit run as the request wrappers run them, inside the request transaction.
 */

export const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

/** A sheet with the template's header row and the given data rows. */
export const sheet = (key: SheetKey, ...rows: Cell[][]): WorkbookSheet => ({
  name: sheetSpec(key).name,
  rows: [sheetSpec(key).columns.map((column) => column.header), ...rows],
});

export interface ImportKit {
  orm: Orm;
  container: AppContainer;
  /** Runs `fn` with a tenant's services inside a committed request transaction. */
  write<T>(fn: (cradle: Cradle) => Promise<T>, tenant?: TenantCode): Promise<T>;
  dryRun(workbook: WorkbookSheet[], tenant?: TenantCode): Promise<ImportReport>;
  commit(workbook: WorkbookSheet[], token: string, tenant?: TenantCode): Promise<ImportReport>;
  /** The tenant's audit entries so far. */
  auditCount(tenant?: TenantCode): Promise<number>;
}

export async function importKit(): Promise<ImportKit> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-import-")) });
  await migrateDatabase(config);
  const orm = await initOrm(toDbOptions(config));
  const container = createAppContainer(config, orm);
  const write = async <T>(fn: (cradle: Cradle) => Promise<T>, tenant: TenantCode = "prod") => {
    const scope = await scopeForTenant(container, tenant);
    return inRequestTransaction(scope.cradle.em, () => fn(scope.cradle));
  };
  return {
    orm,
    container,
    write,
    dryRun: (workbook, tenant) => write((cradle) => cradle.importService.dryRun(prepareImport(workbook), ACTOR), tenant),
    commit: (workbook, token, tenant) => write((cradle) => cradle.importService.commit(prepareImport(workbook), token, ACTOR), tenant),
    auditCount: async (tenant = "prod") => (await scopeForTenant(container, tenant)).cradle.em.count(TenantAuditEvent, {}),
  };
}
