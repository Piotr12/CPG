"use server";

import {
  assertAdmin,
  prepareImport,
  serverAction,
  tenantServerAction,
  uiActor,
  type ImportReport,
  type Result,
  type SessionUser,
} from "@cpg/core";
import { importCommitSchema, importDryRunSchema } from "@cpg/core/validators/imports/import-request.schema";
import { currentUser } from "../../../../auth/require-admin";
import { readWorkbook } from "../../../../components/imports/workbook-file";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The Import screen's dry run and commit (spec 2026-10-20--0908UTC-master-data-bom-import). Each is
 * bound by the page to the tenant and dataset generation it rendered (`tenantServerAction`), and
 * gets the workbook as base64. Admin only. The session is checked, and the workbook read and
 * prepared, before the write's transaction opens (Q10), so that work holds no lock.
 */

/** The admin and the prepared workbook, or the refusal: not the admin, or a workbook that can't be read. */
function prepared(user: SessionUser | null, schema: typeof importDryRunSchema | typeof importCommitSchema, values: unknown) {
  return serverAction(schema, async (input) => ({ admin: assertAdmin(user), prepared: prepareImport(await readWorkbook(input.workbook)) }))(values);
}

/** Every error, or the preview and the token a commit needs; nothing is written (XLS-009…011). */
export async function dryRunImport(tenant: string, generation: number, values: unknown): Promise<Result<ImportReport>> {
  const read = await prepared(await currentUser(), importDryRunSchema, values);
  if (!read.ok) return read;
  const { admin, prepared: workbook } = read.data;
  return tenantServerAction(importDryRunSchema, (_input, { cradle }) => cradle.importService.dryRun(workbook, uiActor(admin)))(tenant, generation, values);
}

/**
 * Applies the dry run's workbook in one go, or nothing: `IMPORT_STALE` when anything it uses changed
 * since (XLS-012…014). Refreshes the master-data pages it may have changed.
 */
export async function commitImport(tenant: string, generation: number, values: unknown): Promise<Result<ImportReport>> {
  const read = await prepared(await currentUser(), importCommitSchema, values);
  if (!read.ok) return read;
  const { admin, prepared: workbook } = read.data;
  const result = await tenantServerAction(importCommitSchema, ({ previewToken }, { cradle }) =>
    cradle.importService.commit(workbook, previewToken, uiActor(admin)),
  )(tenant, generation, values);
  const pages = ["materials", "locations", "customers", "suppliers", "planning-parameters", "safety-stock", "boms"];
  return result.ok ? refreshAfterWrite(result, ...pages.map((page) => `/admin/${tenant}/${page}`)) : result;
}
