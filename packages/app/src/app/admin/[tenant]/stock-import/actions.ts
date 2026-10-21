"use server";

import {
  assertSignedIn,
  prepareStockImport,
  serverAction,
  tenantServerAction,
  uiActor,
  type ImportReport,
  type Result,
  type SessionUser,
} from "@cpg/core";
import { stockImportCommitSchema, stockImportDryRunSchema } from "@cpg/core/validators/imports/import-request.schema";
import { currentUser } from "../../../../auth/require-admin";
import { readWorkbook } from "../../../../components/imports/workbook-file";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The Stock import screen's dry run and commit (spec 2026-10-20--2225UTC-stock-import). Each is bound
 * by the page to the tenant and dataset generation it rendered (`tenantServerAction`), and gets the
 * workbook as base64. Both roles (STX-018). The session is checked, and the workbook read and
 * prepared, before the write's transaction opens (Q11), so that work holds no lock.
 */

/** The signed-in account and the prepared workbook, or the refusal: signed out, or a workbook that can't be read. */
function prepared(user: SessionUser | null, schema: typeof stockImportDryRunSchema | typeof stockImportCommitSchema, values: unknown) {
  return serverAction(schema, async (input) => ({ user: assertSignedIn(user), prepared: prepareStockImport(await readWorkbook(input.workbook)) }))(values);
}

/** Every error, or each position's movement and the token a commit needs; nothing is written (STX-003…017). */
export async function dryRunStockImport(tenant: string, generation: number, values: unknown): Promise<Result<ImportReport>> {
  const read = await prepared(await currentUser(), stockImportDryRunSchema, values);
  if (!read.ok) return read;
  const { prepared: workbook } = read.data;
  return tenantServerAction(stockImportDryRunSchema, (_input, { cradle }) => cradle.stockImportService.dryRun(workbook))(tenant, generation, values);
}

/**
 * Posts the dry run's movements in one go with one reason, or nothing: `IMPORT_STALE` when a listed
 * balance changed since (STX-014, STX-016). Refreshes the Stock page.
 */
export async function commitStockImport(tenant: string, generation: number, values: unknown): Promise<Result<ImportReport>> {
  const read = await prepared(await currentUser(), stockImportCommitSchema, values);
  if (!read.ok) return read;
  const { user, prepared: workbook } = read.data;
  const result = await tenantServerAction(stockImportCommitSchema, ({ previewToken, reason }, { cradle }) =>
    cradle.stockImportService.commit(workbook, previewToken, reason, uiActor(user)),
  )(tenant, generation, values);
  return result.ok ? refreshAfterWrite(result, `/admin/${tenant}/stock`) : result;
}
