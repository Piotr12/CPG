import { parseInput, prepareStockImport } from "@cpg/core";
import { stockImportDryRunSchema } from "@cpg/core/validators/imports/import-request.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { readWorkbook } from "../../../../../../components/imports/workbook-file";

type Context = RouteContext<"/api/tenants/[tenant]/stock-import/dry-run">;

/**
 * The stock import's dry run (spec `2026-10-20--2225UTC-stock-import`, Q7, Q12): the workbook as
 * base64, read and checked before any database work, then every position's current balance read.
 * Answers every error, or each position's movement and the token a commit needs; writes no stock.
 * Both roles; keyed and gated like every tenant write (Q9).
 */
export const POST = tenantApiWrite(async ({ body, cradle }: WriteContext<Context>) => {
  const { workbook } = parseInput(stockImportDryRunSchema, body);
  const prepared = prepareStockImport(await readWorkbook(workbook));
  return cradle.stockImportService.dryRun(prepared);
});
