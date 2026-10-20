/*
 * The import workbook's layout (spec `2026-10-20--0908UTC-master-data-bom-import`, Q2, Q8, Q9): its
 * sheets in the order they are applied, each sheet's columns, and the limits. One source for the
 * engine that reads a workbook, the template that writes one, and the help that explains it. Sheet
 * names and column headers are a contract with the admins' saved files (Q16): change them only by
 * adding.
 */

/** The largest workbook file accepted, in bytes (Q10). */
export const IMPORT_FILE_MAX_BYTES = 512 * 1024;

/** The most data rows a workbook may hold, across all its sheets (Q10). */
export const IMPORT_ROWS_MAX = 2000;

/** The most bytes a workbook may inflate to, counted while inflating (Q10). */
export const IMPORT_INFLATED_MAX_BYTES = 20 * 1024 * 1024;

/**
 * The most cells a workbook's sheets may span, all sheets together: each sheet's last row times its
 * last filled column. The reader pads every row out to that column and fills every gap row, so a
 * tiny file with one cell far away would otherwise exhaust the server's memory (Q10).
 */
export const IMPORT_CELLS_MAX = 200_000;

/** The longest import reference of a new BOM (Q8). */
export const IMPORT_REFERENCE_MAX = 40;

/**
 * How a cell is read (Q9). `id`: an eight-digit ID, zero-padded from a number or shorter digits.
 * `text`: trimmed text, a number in plain decimal notation. `word`: like `text`, lowercased.
 * `date`: `YYYY-MM-DD`, from a date cell or text. `active`: yes/no. `bom`: a BOM ID or an import reference.
 */
export type ColumnKind = "id" | "text" | "word" | "date" | "active" | "bom";

/** English and Polish text for the template's instruction sheets. */
export interface Bilingual {
  en: string;
  pl: string;
}

export interface ColumnSpec {
  /** The header in the sheet's first row, matched case-insensitively. */
  header: string;
  /** The key the engine reads it into: the service input's field name where there is one. */
  field: string;
  kind: ColumnKind;
  /** When the cell must be filled. */
  required: "always" | "on-create" | "never";
  /** What the template shows as an example value. */
  example: string;
  meaning: Bilingual;
}

export type SheetKey =
  | "materials"
  | "unitConversions"
  | "locations"
  | "customers"
  | "suppliers"
  | "planningParameters"
  | "safetyStock"
  | "bomHeaders"
  | "bomLines";

/**
 * A column header a sheet refuses with its own explanation, rather than as an unknown column: the
 * stock sheet's transit columns (stock-import spec Q8).
 */
export interface RefusedColumn {
  /** The headers, matched case-insensitively. */
  headers: readonly string[];
  code: string;
  message: string;
}

export interface SheetSpec<K extends string = SheetKey> {
  key: K;
  /** The sheet's tab name, matched case-insensitively. */
  name: string;
  purpose: Bilingual;
  columns: ColumnSpec[];
  refusedColumns?: readonly RefusedColumn[];
}

/**
 * One kind of import workbook (stock-import spec Q1): its data sheets in the order they are applied,
 * and the general rules its instruction sheets start with. The master-data import and the stock
 * import share the engine that reads a workbook against its layout.
 */
export interface ImportLayout<K extends string = string> {
  sheets: readonly SheetSpec<K>[];
  rules: readonly Bilingual[];
}

const ACTIVE: ColumnSpec = {
  header: "Active",
  field: "active",
  kind: "active",
  required: "never",
  example: "yes",
  meaning: {
    en: "yes or no. Blank keeps an existing record's flag; a new record is always created active.",
    pl: "tak lub nie. Puste pozostawia flagę istniejącego rekordu; nowy rekord jest zawsze tworzony jako aktywny.",
  },
};

const recordId = (noun: Bilingual): ColumnSpec => ({
  header: "ID",
  field: "id",
  kind: "id",
  required: "never",
  example: "00000001",
  meaning: {
    en: `Blank creates a new ${noun.en} with the next ID. An existing ID updates that ${noun.en}. An ID that doesn't exist is an error.`,
    pl: `Puste tworzy nowy rekord (${noun.pl}) z kolejnym ID. Istniejące ID aktualizuje ten rekord. ID, które nie istnieje, jest błędem.`,
  },
});

const reference = (header: string, field: string, noun: Bilingual, example: string): ColumnSpec => ({
  header,
  field,
  kind: "id",
  required: "always",
  example,
  meaning: {
    en: `The ID of an existing ${noun.en}, or of one an earlier sheet of this workbook creates.`,
    pl: `ID istniejącego rekordu (${noun.pl}) lub rekordu tworzonego przez wcześniejszy arkusz tego skoroszytu.`,
  },
});

const MATERIAL: Bilingual = { en: "material", pl: "materiał" };
const LOCATION: Bilingual = { en: "location", pl: "lokalizacja" };

const namedRecordSheet = (key: SheetKey, name: string, noun: Bilingual, example: string): SheetSpec => ({
  key,
  name,
  purpose: { en: `One row per ${noun.en}.`, pl: `Jeden wiersz na rekord (${noun.pl}).` },
  columns: [
    recordId(noun),
    {
      header: "Name",
      field: "name",
      kind: "text",
      required: "always",
      example,
      meaning: { en: "1–100 characters.", pl: "1–100 znaków." },
    },
    ACTIVE,
  ],
});

/** The data sheets, in the order the import applies them (Q2). */
export const IMPORT_SHEETS: readonly SheetSpec[] = [
  {
    key: "materials",
    name: "Materials",
    purpose: { en: "One row per material.", pl: "Jeden wiersz na materiał." },
    columns: [
      recordId(MATERIAL),
      {
        header: "Type",
        field: "type",
        kind: "word",
        required: "always",
        example: "raw",
        meaning: { en: "raw, intermediate or finished.", pl: "raw (surowiec), intermediate (półprodukt) lub finished (wyrób gotowy)." },
      },
      {
        header: "Description",
        field: "description",
        kind: "text",
        required: "always",
        example: "Steel sheet 2 mm",
        meaning: { en: "1–200 characters.", pl: "1–200 znaków." },
      },
      {
        header: "Base unit",
        field: "baseUnit",
        kind: "text",
        required: "always",
        example: "kg",
        meaning: {
          en: "The unit every quantity of this material is stored in, such as kg or each.",
          pl: "Jednostka, w której przechowywane są wszystkie ilości materiału, np. kg lub each.",
        },
      },
      ACTIVE,
    ],
  },
  {
    key: "unitConversions",
    name: "Unit conversions",
    purpose: {
      en: "One row per material and alternate unit: 1 unit = numerator ÷ denominator base units. An existing unit gets the new factor.",
      pl: "Jeden wiersz na materiał i jednostkę alternatywną: 1 jednostka = licznik ÷ mianownik jednostek bazowych. Istniejąca jednostka dostaje nowy przelicznik.",
    },
    columns: [
      reference("Material ID", "material", MATERIAL, "00000002"),
      {
        header: "Unit",
        field: "unit",
        kind: "text",
        required: "always",
        example: "case",
        meaning: { en: "The alternate unit, not the base unit.", pl: "Jednostka alternatywna, nie bazowa." },
      },
      {
        header: "Numerator",
        field: "numerator",
        kind: "text",
        required: "always",
        example: "12",
        meaning: { en: "A number greater than 0.", pl: "Liczba większa od 0." },
      },
      {
        header: "Denominator",
        field: "denominator",
        kind: "text",
        required: "always",
        example: "1",
        meaning: { en: "A number greater than 0.", pl: "Liczba większa od 0." },
      },
    ],
  },
  namedRecordSheet("locations", "Locations", LOCATION, "Main cave"),
  namedRecordSheet("customers", "Customers", { en: "customer", pl: "klient" }, "Stone Age Retail"),
  namedRecordSheet("suppliers", "Suppliers", { en: "supplier", pl: "dostawca" }, "Flint & Co"),
  {
    key: "planningParameters",
    name: "Planning parameters",
    purpose: {
      en: "One row per material and location. An existing pair gets the new values.",
      pl: "Jeden wiersz na materiał i lokalizację. Istniejąca para dostaje nowe wartości.",
    },
    columns: [
      reference("Material ID", "material", MATERIAL, "00000001"),
      reference("Location ID", "location", LOCATION, "00000001"),
      {
        header: "Procurement",
        field: "procurement",
        kind: "word",
        required: "always",
        example: "buy",
        meaning: { en: "make or buy. A raw material is always buy.", pl: "make (produkcja) lub buy (zakup). Surowiec zawsze buy." },
      },
      {
        header: "Lead time days",
        field: "leadTimeDays",
        kind: "text",
        required: "always",
        example: "5",
        meaning: { en: "Whole calendar days, 0–999.", pl: "Pełne dni kalendarzowe, 0–999." },
      },
      {
        header: "Minimum quantity",
        field: "minimumQuantity",
        kind: "text",
        required: "always",
        example: "0",
        meaning: { en: "In the base unit, at least 0.", pl: "W jednostce bazowej, co najmniej 0." },
      },
      {
        header: "Lot multiple",
        field: "lotMultiple",
        kind: "text",
        required: "always",
        example: "1",
        meaning: { en: "In the base unit, greater than 0.", pl: "W jednostce bazowej, większa od 0." },
      },
    ],
  },
  {
    key: "safetyStock",
    name: "Safety stock",
    purpose: {
      en: "One row per material, location and date. An existing target gets the new quantity.",
      pl: "Jeden wiersz na materiał, lokalizację i datę. Istniejący cel dostaje nową ilość.",
    },
    columns: [
      reference("Material ID", "material", MATERIAL, "00000001"),
      reference("Location ID", "location", LOCATION, "00000001"),
      {
        header: "Effective from",
        field: "effectiveFrom",
        kind: "date",
        required: "always",
        example: "2027-01-01",
        meaning: { en: "A date, YYYY-MM-DD.", pl: "Data, RRRR-MM-DD." },
      },
      {
        header: "Quantity",
        field: "quantity",
        kind: "text",
        required: "always",
        example: "100",
        meaning: { en: "In the base unit, at least 0.", pl: "W jednostce bazowej, co najmniej 0." },
      },
    ],
  },
  {
    key: "bomHeaders",
    name: "BOM headers",
    purpose: {
      en: "One row per BOM. Its lines on the BOM lines sheet are its complete recipe: a component left out is removed in a new revision, and an identical recipe creates no revision.",
      pl: "Jeden wiersz na BOM. Jego wiersze w arkuszu BOM lines to pełna receptura: pominięty składnik jest usuwany w nowej rewizji, a identyczna receptura nie tworzy rewizji.",
    },
    columns: [
      {
        header: "BOM ID",
        field: "id",
        kind: "id",
        required: "never",
        example: "",
        meaning: {
          en: "Blank creates a new BOM with the next ID. An existing ID revises that BOM when its recipe changes. An ID that doesn't exist is an error.",
          pl: "Puste tworzy nowy BOM z kolejnym ID. Istniejące ID tworzy nową rewizję tego BOM, gdy receptura się zmienia. ID, które nie istnieje, jest błędem.",
        },
      },
      {
        header: "Import reference",
        field: "reference",
        kind: "text",
        required: "on-create",
        example: "RECIPE-X",
        meaning: {
          en: "Required when BOM ID is blank: a name of your choice, unique in this sheet, with at least one letter. The BOM lines of a new BOM name it in their BOM column.",
          pl: "Wymagane, gdy BOM ID jest puste: dowolna nazwa, unikalna w arkuszu, z co najmniej jedną literą. Wiersze nowego BOM podają ją w kolumnie BOM.",
        },
      },
      {
        header: "Output material ID",
        field: "output",
        kind: "id",
        required: "on-create",
        example: "00000005",
        meaning: {
          en: "Required for a new BOM: the intermediate or finished material it makes. An existing BOM's output can't change.",
          pl: "Wymagane dla nowego BOM: półprodukt lub wyrób gotowy, który powstaje. Wyrobu istniejącego BOM nie można zmienić.",
        },
      },
      {
        header: "Priority",
        field: "priority",
        kind: "text",
        required: "always",
        example: "1",
        meaning: { en: "1–999; 1 is the highest.", pl: "1–999; 1 to najwyższy." },
      },
      {
        header: "Valid from",
        field: "validFrom",
        kind: "date",
        required: "always",
        example: "2027-01-01",
        meaning: { en: "A date, YYYY-MM-DD, included.", pl: "Data, RRRR-MM-DD, włącznie." },
      },
      {
        header: "Valid through",
        field: "validThrough",
        kind: "date",
        required: "never",
        example: "",
        meaning: { en: "A date, YYYY-MM-DD, included. Blank: no end.", pl: "Data, RRRR-MM-DD, włącznie. Puste: bez końca." },
      },
      ACTIVE,
    ],
  },
  {
    key: "bomLines",
    name: "BOM lines",
    purpose: {
      en: "One row per component of a BOM, per one base unit of its output.",
      pl: "Jeden wiersz na składnik BOM, na jedną jednostkę bazową wyrobu.",
    },
    columns: [
      {
        header: "BOM",
        field: "bom",
        kind: "bom",
        required: "always",
        example: "RECIPE-X",
        meaning: {
          en: "The BOM ID of an existing BOM, or the import reference of a new one, from the BOM headers sheet.",
          pl: "BOM ID istniejącego BOM lub referencja importu nowego, z arkusza BOM headers.",
        },
      },
      reference("Component material ID", "material", MATERIAL, "00000001"),
      {
        header: "Quantity",
        field: "quantity",
        kind: "text",
        required: "always",
        example: "4.5",
        meaning: { en: "Greater than 0, in the unit below.", pl: "Większa od 0, w jednostce obok." },
      },
      {
        header: "Unit",
        field: "unit",
        kind: "text",
        required: "never",
        example: "kg",
        meaning: {
          en: "The component's base unit or a unit it converts. Blank: its base unit.",
          pl: "Jednostka bazowa składnika lub jednostka z przelicznikiem. Puste: jednostka bazowa.",
        },
      },
    ],
  },
];

/** The template's instruction sheets, which the import ignores (Q16). */
export const INSTRUCTION_SHEETS = { en: "Instructions", pl: "Instrukcja" } as const;

/** The general rules the instruction sheets start with, before each sheet's columns. */
export const IMPORT_RULES: readonly Bilingual[] = [
  {
    en: "Fill the sheets you need and leave the others empty. Keep each sheet's first row: the columns are found by their headers.",
    pl: "Wypełnij potrzebne arkusze, a pozostałe zostaw puste. Zachowaj pierwszy wiersz każdego arkusza: kolumny są rozpoznawane po nagłówkach.",
  },
  {
    en: "Sheets are applied in this order: Materials, Unit conversions, Locations, Customers, Suppliers, Planning parameters, Safety stock, BOM headers with BOM lines. A row can use records that exist already, or that an earlier sheet creates (the dry run shows their new IDs).",
    pl: "Arkusze są stosowane w kolejności: Materials, Unit conversions, Locations, Customers, Suppliers, Planning parameters, Safety stock, BOM headers z BOM lines. Wiersz może używać rekordów, które już istnieją lub które tworzy wcześniejszy arkusz (próba pokazuje ich nowe ID).",
  },
  {
    en: "A blank ID creates a record, an existing ID updates it, and an ID that doesn't exist is an error. Each key may appear once per sheet. Nothing is ever deleted by an import.",
    pl: "Puste ID tworzy rekord, istniejące ID go aktualizuje, a ID, które nie istnieje, jest błędem. Każdy klucz może wystąpić raz w arkuszu. Import nigdy niczego nie usuwa.",
  },
  {
    en: "Upload the workbook for a dry run first: it reports every error by sheet, row and column, or shows what would be created and changed. Only an error-free dry run can be committed, and the commit applies everything or nothing.",
    pl: "Najpierw wyślij skoroszyt do próby: pokaże każdy błąd z arkuszem, wierszem i kolumną albo to, co zostanie utworzone i zmienione. Zatwierdzić można tylko próbę bez błędów, a zatwierdzenie stosuje wszystko albo nic.",
  },
  {
    en: `At most ${IMPORT_ROWS_MAX} rows and ${IMPORT_FILE_MAX_BYTES / 1024} KB per workbook.`,
    pl: `Najwyżej ${IMPORT_ROWS_MAX} wierszy i ${IMPORT_FILE_MAX_BYTES / 1024} KB na skoroszyt.`,
  },
];

/** The master-data and BOM workbook. */
export const MASTER_DATA_LAYOUT: ImportLayout<SheetKey> = { sheets: IMPORT_SHEETS, rules: IMPORT_RULES };

/** A data sheet of `layout` by its tab name (case-insensitive, trimmed), or undefined. */
export function layoutSheetNamed<K extends string>(layout: ImportLayout<K>, name: string): SheetSpec<K> | undefined {
  const wanted = name.trim().toLowerCase();
  return layout.sheets.find((sheet) => sheet.name.toLowerCase() === wanted);
}

/** A master-data sheet by its tab name (case-insensitive, trimmed), or undefined. */
export function sheetNamed(name: string): SheetSpec | undefined {
  return layoutSheetNamed(MASTER_DATA_LAYOUT, name);
}

/** Whether a tab is one of the template's instruction sheets. */
export function isInstructionSheet(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return Object.values(INSTRUCTION_SHEETS).some((instructions) => instructions.toLowerCase() === wanted);
}

/** A sheet by its key. */
export function sheetSpec(key: SheetKey): SheetSpec {
  return IMPORT_SHEETS.find((sheet) => sheet.key === key)!;
}

/** The header of a sheet's column by its field, or null when the sheet has no such field. */
export function columnHeader(key: SheetKey, field: string): string | null {
  return sheetSpec(key).columns.find((column) => column.field === field)?.header ?? null;
}
