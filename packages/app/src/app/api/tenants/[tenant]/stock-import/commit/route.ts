import { apiActor, parseInput, prepareStockImport } from "@cpg/core";
import { stockImportCommitSchema } from "@cpg/core/validators/imports/import-request.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { readWorkbook } from "../../../../../../components/imports/workbook-file";

type Context = RouteContext<"/api/tenants/[tenant]/stock-import/commit">;

/**
 * Commits a stock workbook its dry run accepted (spec `2026-10-20--2225UTC-stock-import`, Q4–Q6):
 * the same workbook, the dry run's `previewToken` and one `reason`. Posts every movement as one
 * correction, or nothing: `IMPORT_STALE` when a listed balance changed since (STX-016). A retry with
 * the same key replays the first result (API-028). Both roles (STX-018).
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) => {
  const { workbook, previewToken, reason } = parseInput(stockImportCommitSchema, body);
  const prepared = prepareStockImport(await readWorkbook(workbook));
  return cradle.stockImportService.commit(prepared, previewToken, reason, apiActor(caller));
});
