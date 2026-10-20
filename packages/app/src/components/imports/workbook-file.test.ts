import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import writeXlsxFile from "write-excel-file/node";
import { describe, expect, it } from "vitest";
import { IMPORT_FILE_MAX_BYTES, IMPORT_INFLATED_MAX_BYTES, IMPORT_ROWS_MAX, prepareImport } from "@cpg/core";
import {
  WORKBOOK_INFLATES_TOO_MUCH_MESSAGE,
  WORKBOOK_TOO_LARGE_MESSAGE,
  WORKBOOK_TOO_MANY_ROWS_MESSAGE,
  WORKBOOK_UNREADABLE_MESSAGE,
} from "@cpg/core/validators/imports/import-request.schema";
import { inflatesWithin, readWorkbook, templateWorkbook } from "./workbook-file";

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** The refusal `readWorkbook` gives, as its field message. */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { fieldErrors: { workbook: string[] } }).fieldErrors.workbook[0];
  }
  throw new Error("expected a refusal");
}

describe("templateWorkbook", () => {
  it("has every data sheet with only its header row, then the instructions in both languages (XLS-001, XLS-017)", async () => {
    const sheets = await readWorkbook(base64(await templateWorkbook()));

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Materials",
      "Unit conversions",
      "Locations",
      "Customers",
      "Suppliers",
      "Planning parameters",
      "Safety stock",
      "BOM headers",
      "BOM lines",
      "Instructions",
      "Instrukcja",
    ]);
    expect(sheets[0].rows).toEqual([["ID", "Type", "Description", "Base unit", "Active"]]);
    expect(sheets[7].rows).toEqual([["BOM ID", "Import reference", "Output material ID", "Priority", "Valid from", "Valid through", "Active"]]);
    // As downloaded, it imports nothing.
    expect(prepareImport(sheets).errors.map((error) => error.code)).toEqual(["IMPORT_EMPTY"]);

    const text = (name: string) => sheets.find((sheet) => sheet.name === name)!.rows.flat().join(" ");
    expect(text("Instructions")).toMatch(/Blank creates a new material with the next ID\. An existing ID updates that material\. An ID that doesn't exist is an error\./);
    expect(text("Instructions")).toMatch(/Import reference Required for a new record/);
    expect(text("Instructions")).toMatch(/complete recipe/);
    expect(text("Instructions")).toMatch(/Example/);
    expect(text("Instrukcja")).toMatch(/Puste tworzy nowy BOM z kolejnym ID/);
    expect(text("Instrukcja")).toMatch(/Wymagana dla nowego rekordu/);
  });
});

describe("readWorkbook", () => {
  it("reads numbers, dates, text and flags as the spreadsheet holds them", async () => {
    const file = await writeXlsxFile([
      {
        sheet: "Materials",
        data: [
          ["ID", "Type", "Description", "Base unit", "Active"],
          ["00000001", "raw", 2.5, "kg", true],
          [7, "raw", { value: new Date(Date.UTC(2027, 0, 31)), type: Date, format: "yyyy-mm-dd" }, "kg", null],
        ],
      },
    ]).toBuffer();

    const [materials] = await readWorkbook(base64(file));

    expect(materials.rows.slice(1)).toEqual([
      ["00000001", "raw", 2.5, "kg", true],
      [7, "raw", new Date(Date.UTC(2027, 0, 31)), "kg", null],
    ]);
  });

  it("refuses a file over 512 KB", async () => {
    expect(await refusal(readWorkbook(base64(new Uint8Array(IMPORT_FILE_MAX_BYTES + 1))))).toBe(WORKBOOK_TOO_LARGE_MESSAGE);
  });

  it("refuses more than 2,000 data rows, not counting headers, blank rows and the instructions", async () => {
    const rows = (count: number) => [["ID"], [null, ""], ...Array.from({ length: count }, (_, index) => [index + 1])];
    const workbook = (count: number) =>
      writeXlsxFile([
        { sheet: "Locations", data: rows(count) },
        { sheet: "Instructions", data: rows(50) },
      ]).toBuffer();

    expect(await refusal(readWorkbook(base64(await workbook(IMPORT_ROWS_MAX + 1))))).toBe(WORKBOOK_TOO_MANY_ROWS_MESSAGE);
    expect((await readWorkbook(base64(await workbook(IMPORT_ROWS_MAX))))[0].rows).toHaveLength(IMPORT_ROWS_MAX + 2);
  });

  it("refuses a file that isn't a readable workbook", async () => {
    expect(await refusal(readWorkbook(base64(strToU8("ID,Name\n1,Cave\n"))))).toBe(WORKBOOK_UNREADABLE_MESSAGE);
    expect(await refusal(readWorkbook(base64(zipSync({ "notes.txt": strToU8("hello") }))))).toBe(WORKBOOK_UNREADABLE_MESSAGE);
    expect(await refusal(readWorkbook(base64(zipSync({}))))).toBe(WORKBOOK_UNREADABLE_MESSAGE);
  });

  it("refuses a workbook that unpacks past 20 MB, even when its headers claim less (a zip bomb)", async () => {
    const bomb = zipSync({ "xl/huge.xml": new Uint8Array(IMPORT_INFLATED_MAX_BYTES + 1) }, { level: 9 });
    expect(bomb.length).toBeLessThan(IMPORT_FILE_MAX_BYTES);
    expect(await refusal(readWorkbook(base64(bomb)))).toBe(WORKBOOK_INFLATES_TOO_MUCH_MESSAGE);

    // Rewrite every "uncompressed size" field to 1 byte: the counting doesn't trust them.
    const forged = Buffer.from(bomb);
    for (let at = 0; at < forged.length - 4; at++) {
      const signature = forged.readUInt32LE(at);
      if (signature === 0x04034b50) forged.writeUInt32LE(1, at + 22);
      if (signature === 0x02014b50) forged.writeUInt32LE(1, at + 24);
    }
    expect(inflatesWithin(forged, IMPORT_INFLATED_MAX_BYTES)).not.toBe("ok");
  });

  it("doesn't expand an XML entity a sheet declares", async () => {
    const file = unzipSync(
      await writeXlsxFile([{ sheet: "Locations", data: [["ID", "Name", "Active"], [null, "Cave", null]] }]).toBuffer(),
    );
    const sheetPath = Object.keys(file).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))!;
    const xml = strFromU8(file[sheetPath])
      .replace("?>", '?><!DOCTYPE worksheet [<!ENTITY boom "EXPANDED">]>')
      .replace(/<c r="B2"([^>]*)>.*?<\/c>/, '<c r="B2" t="inlineStr"><is><t>&boom;</t></is></c>');
    file[sheetPath] = strToU8(xml);

    const result = await readWorkbook(base64(zipSync(file))).then(
      (sheets) => JSON.stringify(sheets),
      (error: Error) => error.message,
    );
    expect(result).not.toContain("EXPANDED");
  });
});

describe("inflatesWithin", () => {
  it("passes an archive within the limit and refuses corrupt data", () => {
    const archive = zipSync({ "a.xml": strToU8("<a/>".repeat(100)) }, { level: 9 });
    expect(inflatesWithin(archive, 1_000)).toBe("ok");
    expect(inflatesWithin(archive, 10)).toBe("too-large");

    const corrupt = Buffer.from(archive);
    const dataStart = 30 + "a.xml".length;
    corrupt.fill(0xff, dataStart, dataStart + 4);
    expect(inflatesWithin(corrupt, 1_000)).toBe("unreadable");
  });
});
