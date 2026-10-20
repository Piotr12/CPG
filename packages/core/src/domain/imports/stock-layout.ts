import { CORRECTION_TRANSIT_MESSAGE } from "../../validators/stock/stock-correction.schema";
import { IMPORT_FILE_MAX_BYTES, IMPORT_ROWS_MAX, type Bilingual, type ImportLayout, type SheetSpec } from "./workbook-layout";

/*
 * The stock workbook's layout (stock-import spec `2026-10-20--2225UTC-stock-import`, Q1, Q2, Q8): one
 * Stock sheet whose rows are the physical quantity each position should have. Its sheet name and
 * column headers are a contract with the users' saved files: change them only by adding.
 */

/** The stock workbook's one data sheet. */
export type StockSheetKey = "stock";

/** Headers that would make a row look like in-transit stock: refused, because transit is written off on its transfer (Q8, TRF-014). */
export const TRANSIT_COLUMN_HEADERS = ["Transfer", "Transfer ID", "In transit", "In-transit"] as const;

export const STOCK_SHEET: SheetSpec<StockSheetKey> = {
  key: "stock",
  name: "Stock",
  purpose: {
    en: "One row per material and location: the physical quantity it should have after the import, not a change.",
    pl: "Jeden wiersz na materiał i lokalizację: ilość fizyczna, jaka ma być po imporcie, a nie zmiana.",
  },
  columns: [
    {
      header: "Material ID",
      field: "material",
      kind: "id",
      required: "always",
      example: "00000001",
      meaning: { en: "The ID of an existing, active material.", pl: "ID istniejącego, aktywnego materiału." },
    },
    {
      header: "Location ID",
      field: "location",
      kind: "id",
      required: "always",
      example: "00000001",
      meaning: { en: "The ID of an existing, active location.", pl: "ID istniejącej, aktywnej lokalizacji." },
    },
    {
      header: "Physical quantity",
      field: "quantity",
      kind: "text",
      required: "always",
      example: "100",
      meaning: {
        en: "What should be physically at the location, at least 0, in the unit beside it. 0 empties the position.",
        pl: "Ilość fizycznie w lokalizacji, co najmniej 0, w jednostce obok. 0 opróżnia pozycję.",
      },
    },
    {
      header: "Unit",
      field: "unit",
      kind: "text",
      required: "never",
      example: "each",
      meaning: {
        en: "The material's base unit or a unit it converts. Blank: its base unit.",
        pl: "Jednostka bazowa materiału lub jednostka z przelicznikiem. Puste: jednostka bazowa.",
      },
    },
  ],
  refusedColumns: [{ headers: TRANSIT_COLUMN_HEADERS, code: "IMPORT_TRANSIT_COLUMN", message: CORRECTION_TRANSIT_MESSAGE }],
};

/** The general rules the stock template's instruction sheets start with. */
export const STOCK_IMPORT_RULES: readonly Bilingual[] = [
  {
    en: "Write the physical quantity each position should have, not the change: the import computes each movement from the current stock. 100 at a position holding 85 posts +15; 0 empties it.",
    pl: "Wpisz ilość fizyczną, jaka ma być w pozycji, a nie zmianę: import wylicza każdy ruch z bieżącego stanu. 100 w pozycji ze stanem 85 księguje +15; 0 ją opróżnia.",
  },
  {
    en: "Positions you leave out are untouched. Each material and location may appear once. A quantity in another unit is converted with the material's current conversion.",
    pl: "Pominięte pozycje pozostają bez zmian. Każda para materiał i lokalizacja może wystąpić raz. Ilość w innej jednostce jest przeliczana bieżącym przelicznikiem materiału.",
  },
  {
    en: "In-transit stock belongs to its transfer and is never a location's balance: write it off on the transfer.",
    pl: "Towar w drodze należy do przesunięcia i nie jest stanem lokalizacji: odpisz go na przesunięciu.",
  },
  {
    en: "Upload the workbook for a dry run first: it shows every movement, or every error by row and column, and writes nothing. Then commit with one reason for all the movements, such as \"Opening balance\" or \"Stock count 2027-01\". The commit posts everything or nothing, and is refused if any of these positions changed since the dry run.",
    pl: "Najpierw wyślij skoroszyt do próby: pokaże każdy ruch albo każdy błąd z wierszem i kolumną, niczego nie zapisując. Potem zatwierdź z jednym powodem dla wszystkich ruchów, np. \"Bilans otwarcia\" lub \"Inwentaryzacja 2027-01\". Zatwierdzenie księguje wszystko albo nic i zostanie odrzucone, jeśli któraś z tych pozycji zmieniła się od próby.",
  },
  {
    en: `At most ${IMPORT_ROWS_MAX} rows and ${IMPORT_FILE_MAX_BYTES / 1024} KB per workbook.`,
    pl: `Najwyżej ${IMPORT_ROWS_MAX} wierszy i ${IMPORT_FILE_MAX_BYTES / 1024} KB na skoroszyt.`,
  },
];

/** The stock workbook (stock-import spec Q1). */
export const STOCK_LAYOUT: ImportLayout<StockSheetKey> = {
  title: { en: "CPG stock import template", pl: "Szablon importu stanów CPG" },
  sheets: [STOCK_SHEET],
  rules: STOCK_IMPORT_RULES,
};
