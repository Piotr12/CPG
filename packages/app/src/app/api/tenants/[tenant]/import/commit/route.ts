import { apiActor, assertAdmin, parseInput, prepareImport } from "@cpg/core";
import { importCommitSchema } from "@cpg/core/validators/imports/import-request.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { readWorkbook } from "../../../../../../components/imports/workbook-file";

type Context = RouteContext<"/api/tenants/[tenant]/import/commit">;

/**
 * Commits a workbook its dry run accepted (spec Q7, XLS-012…014): the same workbook and the dry run's
 * `previewToken`. Applies every row in one go, or nothing: `IMPORT_STALE` when anything the rows name
 * or write changed since. A retry with the same key replays the first result (API-028). Admin only.
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) => {
    const { workbook, previewToken } = parseInput(importCommitSchema, body);
    const prepared = prepareImport(await readWorkbook(workbook));
    return cradle.importService.commit(prepared, previewToken, apiActor(caller));
  },
  { authorize: assertAdmin },
);
