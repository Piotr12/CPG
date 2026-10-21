import { describe, expect, it } from "vitest";
import {
  importCommitSchema,
  importDryRunSchema,
  PREVIEW_TOKEN_MESSAGE,
  stockImportCommitSchema,
  stockImportDryRunSchema,
  WORKBOOK_BASE64_MAX,
  WORKBOOK_REQUIRED_MESSAGE,
  WORKBOOK_TOO_LARGE_MESSAGE,
  WORKBOOK_UNREADABLE_MESSAGE,
} from "./import-request.schema";
import { STOCK_REASON_MESSAGE } from "../stock/stock-correction.schema";

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

const TOKEN = "a".repeat(64);

describe("the import request schemas", () => {
  it("accept a base64 workbook", () => {
    expect(importDryRunSchema.parse({ workbook: "UEsDBA==" })).toEqual({
      workbook: "UEsDBA==",
    });
  });

  it("refuse a missing, empty, non-base64 or oversized workbook", () => {
    expect(messages(importDryRunSchema.safeParse({}))).toEqual([
      WORKBOOK_REQUIRED_MESSAGE,
    ]);
    expect(messages(importDryRunSchema.safeParse({ workbook: "" }))).toEqual([
      WORKBOOK_REQUIRED_MESSAGE,
    ]);
    expect(
      messages(importDryRunSchema.safeParse({ workbook: "not base64!" })),
    ).toEqual([WORKBOOK_UNREADABLE_MESSAGE]);
    expect(
      messages(
        importDryRunSchema.safeParse({
          workbook: "A".repeat(WORKBOOK_BASE64_MAX + 4),
        }),
      ),
    ).toEqual([WORKBOOK_TOO_LARGE_MESSAGE]);
    expect(
      importDryRunSchema.safeParse({
        workbook: "A".repeat(WORKBOOK_BASE64_MAX),
      }).success,
    ).toBe(true);
  });

  it("require the dry run's token on a commit (XLS-012)", () => {
    expect(
      importCommitSchema.parse({ workbook: "UEsDBA==", previewToken: TOKEN }),
    ).toEqual({ workbook: "UEsDBA==", previewToken: TOKEN });
    expect(
      messages(importCommitSchema.safeParse({ workbook: "UEsDBA==" })),
    ).toEqual([PREVIEW_TOKEN_MESSAGE]);
    expect(
      messages(
        importCommitSchema.safeParse({
          workbook: "UEsDBA==",
          previewToken: "A".repeat(64),
        }),
      ),
    ).toEqual([PREVIEW_TOKEN_MESSAGE]);
    expect(
      messages(
        importCommitSchema.safeParse({
          workbook: "UEsDBA==",
          previewToken: "abc",
        }),
      ),
    ).toEqual([PREVIEW_TOKEN_MESSAGE]);
  });

  it("take the stock dry run's workbook alone, and one trimmed reason with the stock commit (stock-import Q4, STX-014)", () => {
    expect(stockImportDryRunSchema.parse({ workbook: "UEsDBA==" })).toEqual({ workbook: "UEsDBA==" });
    expect(stockImportCommitSchema.parse({ workbook: "UEsDBA==", previewToken: TOKEN, reason: "  Opening balance " })).toEqual({
      workbook: "UEsDBA==",
      previewToken: TOKEN,
      reason: "Opening balance",
    });
    for (const reason of [undefined, "", "   ", "x".repeat(501)]) {
      expect(messages(stockImportCommitSchema.safeParse({ workbook: "UEsDBA==", previewToken: TOKEN, reason }))).toEqual([STOCK_REASON_MESSAGE]);
    }
    expect(stockImportCommitSchema.safeParse({ workbook: "UEsDBA==", previewToken: TOKEN, reason: "x".repeat(500) }).success).toBe(true);
    expect(messages(stockImportCommitSchema.safeParse({ workbook: "UEsDBA==", reason: "Count" }))).toEqual([PREVIEW_TOKEN_MESSAGE]);
  });
});
