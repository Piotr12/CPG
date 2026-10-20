import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareStockImport } from "@cpg/core";
import { readWorkbook } from "../../../../components/imports/workbook-file";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock("../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

describe("GET /api/stock-import/template", () => {
  afterEach(() => vi.clearAllMocks());

  it("serves the stock template to any signed-in account as an .xlsx attachment", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });

    const response = await GET(new Request("http://cpg.test/api/stock-import/template"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cpg-stock-template.xlsx"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const sheets = await readWorkbook(Buffer.from(await response.arrayBuffer()).toString("base64"));
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Stock", "Instructions", "Instrukcja"]);
    expect(prepareStockImport(sheets).errors.map((error) => error.code)).toEqual(["IMPORT_EMPTY"]);
  });

  it("answers 401 in the shared envelope without a credential", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request("http://cpg.test/api/stock-import/template"));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });
});
