import { apiActor, assertAdmin, parseInput, prepareImport } from "@cpg/core";
import { importDryRunSchema } from "@cpg/core/validators/imports/import-request.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { readWorkbook } from "../../../../../../components/imports/workbook-file";

type Context = RouteContext<"/api/tenants/[tenant]/import/dry-run">;

/**
 * The import's dry run (spec `2026-10-20--0908UTC-master-data-bom-import`, API-015): the workbook as
 * base64, read and checked before the import's first write, then every row through the services in
 * a savepoint that is rolled back. Answers every error, or the preview and the token a commit needs.
 * Admin only, checked before the key and the body; keyed and gated like every tenant write (Q11, Q13).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) => {
    const { workbook } = parseInput(importDryRunSchema, body);
    const prepared = prepareImport(await readWorkbook(workbook));
    return cradle.importService.dryRun(prepared, apiActor(caller));
  },
  { authorize: assertAdmin },
);
