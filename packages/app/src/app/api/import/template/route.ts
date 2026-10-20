import { requireApiUser } from "../../../../auth/require-api-user";
import { templateWorkbook, XLSX_CONTENT_TYPE } from "../../../../components/imports/workbook-file";
import { apiHandler } from "../../../../routing/api-handler";

/** The caller check, answered in the shared envelope when it fails (401 for no or a bad credential). */
const checkCaller = apiHandler(async (request: Request) => {
  await requireApiUser(request);
  return null;
});

/**
 * The import template (spec `2026-10-20--0908UTC-master-data-bom-import`, Q12, XLS-001, XLS-017), the
 * same for both tenants: any signed-in account, by bearer token or the session cookie. The `.xlsx`
 * holds no data, only the header rows and the instructions.
 */
export async function GET(request: Request): Promise<Response> {
  const checked = await checkCaller(request, undefined);
  if (checked.status !== 200) return checked;
  return new Response(new Uint8Array(await templateWorkbook()), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": 'attachment; filename="cpg-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
