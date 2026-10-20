import { describe, expect, it } from "vitest";
import { ID_FORMAT_MESSAGE } from "@cpg/core/validators/imports/import-rows.schema";
import { WORKBOOK_TOO_LARGE_MESSAGE, WORKBOOK_TOO_MANY_CELLS_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { NAME_REQUIRED_MESSAGE } from "@cpg/core/validators/named-records/named-record-fields.schema";
import { TYPE_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { PRIORITY_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { importLabels } from "./labels";

describe("importLabels", () => {
  it("gathers every screen's translation of a cell's message, and the import's own", () => {
    const labels = importLabels(pl);

    expect(labels.fieldMessages[TYPE_MESSAGE]).toBe(pl.materials.fieldErrors.type);
    expect(labels.fieldMessages[NAME_REQUIRED_MESSAGE]).toBe(pl.locations.fieldErrors.nameRequired);
    expect(labels.fieldMessages[PRIORITY_MESSAGE]).toBe(pl.boms.fieldErrors.priority);
    expect(labels.fieldMessages[ID_FORMAT_MESSAGE]).toBe(pl.imports.fieldErrors.id);
    expect(labels.fieldMessages[WORKBOOK_TOO_LARGE_MESSAGE]).toBe(pl.imports.fieldErrors.workbookTooLarge);
    expect(labels.fieldMessages[WORKBOOK_TOO_MANY_CELLS_MESSAGE]).toBe(pl.imports.fieldErrors.workbookTooManyCells);
    // The English copy is the server's own message.
    expect(importLabels(en).fieldMessages[WORKBOOK_TOO_MANY_CELLS_MESSAGE]).toBe(WORKBOOK_TOO_MANY_CELLS_MESSAGE);
  });

  it("merges the codes of every screen the import writes through, its own last", () => {
    const labels = importLabels(en);

    expect(labels.errors.IMPORT_STALE).toBe(en.imports.errors.IMPORT_STALE);
    expect(labels.errors.FORBIDDEN).toBe(en.imports.errors.FORBIDDEN);
    expect(labels.errors.BOM_CYCLE).toBe(en.boms.errors.BOM_CYCLE);
    // A race on any sheet is named neutrally, not as another screen's record.
    expect(labels.errors.CONFLICT).toBe(en.imports.errors.CONFLICT);
    expect(labels.errors.VERSION_CONFLICT).toBe(en.imports.errors.VERSION_CONFLICT);
    expect(labels.errors.TENANT_READ_ONLY).toBe(en.errors.TENANT_READ_ONLY);
    expect("heading" in labels).toBe(false);
  });

  it("holds only plain data, as a client component's props must (functions would fail the page)", () => {
    const functions = (value: unknown, at: string): string[] => {
      if (typeof value === "function") return [at];
      if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => functions(child, `${at}.${key}`));
      return [];
    };

    expect(functions(importLabels(en), "en")).toEqual([]);
    expect(functions(importLabels(pl), "pl")).toEqual([]);
  });
});
