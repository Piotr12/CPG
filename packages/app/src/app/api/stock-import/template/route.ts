import { STOCK_LAYOUT } from "@cpg/core";
import { requireApiUser } from "../../../../auth/require-api-user";
import { templateWorkbook, XLSX_CONTENT_TYPE } from "../../../../components/imports/workbook-file";
import { apiHandler } from "../../../../routing/api-handler";

/** The caller check, answered in the shared envelope when it fails (401 for no or a bad credential). */
const checkCaller = apiHandler(async (request: Request) => {
  await requireApiUser(request);
  return null;
});

/**
 * The stock import template (spec `2026-10-20--2225UTC-stock-import`, Q12, STX-001), the same for
 * both tenants: any signed-in account, by bearer token or the session cookie. The `.xlsx` holds no
 * data, only the Stock sheet's header row and the instructions.
 */
export async function GET(request: Request): Promise<Response> {
  const checked = await checkCaller(request, undefined);
  if (checked.status !== 200) return checked;
  return new Response(new Uint8Array(await templateWorkbook(STOCK_LAYOUT)), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": 'attachment; filename="cpg-stock-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
