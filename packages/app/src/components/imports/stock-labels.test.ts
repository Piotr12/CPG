import { describe, expect, it } from "vitest";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { importLabels } from "./labels";
import { stockImportLabels } from "./stock-labels";

describe("stockImportLabels", () => {
  it("puts the stock wording over the Import screen's", () => {
    const labels = stockImportLabels(pl);

    expect(labels.template).toEqual(pl.stockImport.template);
    expect(labels.upload).toEqual({ ...pl.imports.upload, ...pl.stockImport.upload });
    expect(labels.summary.updated).toBe("Korekty");
    expect(labels.summary.errors).toBe(pl.imports.summary.errors);
    expect(labels.preview.record).toBe(pl.stockImport.preview.record);
    expect(labels.actions).toMatchObject({ update: "Skoryguj", unchanged: "Bez zmian" });
    expect(labels.results.update).toBe("Skorygowano");
    expect(labels.change).toEqual({ ...pl.imports.change, fields: { Movement: "Ruch", Entered: "Wpisano" } });
    expect(labels.commit.button).toEqual(pl.stockImport.commit.button);
    expect(labels.commit.nothing).toBe(pl.imports.commit.nothing);
    expect(labels.readOnly).toBe(pl.stockImport.readOnly);
    expect(labels.reason).toEqual(pl.stockImport.reason);
  });

  it("translates the stock refusals, its own issues and the reason's field message", () => {
    const labels = stockImportLabels(en);

    expect(labels.issues.IMPORT_MISSING_REFERENCE).toBe(en.stockImport.issues.IMPORT_MISSING_REFERENCE);
    expect((labels.issues as Record<string, string>).IMPORT_TRANSIT_COLUMN).toBe(en.stockImport.issues.IMPORT_TRANSIT_COLUMN);
    expect(labels.issues.IMPORT_EMPTY).toBe(en.imports.issues.IMPORT_EMPTY);
    expect(labels.errors.IMPORT_STALE).toBe(en.stockImport.errors.IMPORT_STALE);
    expect(labels.errors.MATERIAL_INACTIVE).toBe(en.stock.errors.MATERIAL_INACTIVE);
    expect(labels.errors.TENANT_READ_ONLY).toBe(en.errors.TENANT_READ_ONLY);
    expect(labels.fieldMessages[STOCK_REASON_MESSAGE]).toBe(en.stock.fieldErrors.reason);
    expect(labels.fieldMessages).toMatchObject(importLabels(en).fieldMessages);
  });

  it("holds only plain data, as a client component's props must", () => {
    const functions = (value: unknown, at: string): string[] => {
      if (typeof value === "function") return [at];
      if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => functions(child, `${at}.${key}`));
      return [];
    };

    expect(functions(stockImportLabels(en), "en")).toEqual([]);
    expect(functions(stockImportLabels(pl), "pl")).toEqual([]);
  });
});
