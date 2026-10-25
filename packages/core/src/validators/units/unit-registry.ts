import { z } from "zod";

/**
 * The closed list of units a new base unit or conversion may use (#217). A static table, reviewed like
 * code: no admin screen, no migration, and client forms may import it. A unit is stored by its
 * `symbol`, as before; the UN/ECE Recommendation 20 `code` is the stable key a later exchange can use.
 * Units stored before the registry stay valid wherever a record already has them.
 */

export const UNIT_DIMENSIONS = ["count", "packaging", "mass", "volume", "length", "area", "time", "statistical"] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export interface RegisteredUnit {
  /** UN/ECE Rec 20 common code. */
  code: string;
  /** What screens show and records store. */
  symbol: string;
  name: { en: string; pl: string };
  dimension: UnitDimension;
}

export const UNITS: readonly RegisteredUnit[] = [
  { code: "EA", symbol: "each", name: { en: "each", pl: "sztuka" }, dimension: "count" },
  { code: "H87", symbol: "pcs", name: { en: "piece", pl: "sztuka" }, dimension: "count" },
  { code: "PR", symbol: "pair", name: { en: "pair", pl: "para" }, dimension: "count" },
  { code: "SET", symbol: "set", name: { en: "set", pl: "komplet" }, dimension: "count" },
  { code: "ST", symbol: "sheet", name: { en: "sheet", pl: "arkusz" }, dimension: "count" },
  // A pack counts whole packs; each material's conversion says what one holds.
  { code: "BX", symbol: "box", name: { en: "box", pl: "pudełko" }, dimension: "packaging" },
  { code: "CS", symbol: "case", name: { en: "case", pl: "karton" }, dimension: "packaging" },
  { code: "BG", symbol: "bag", name: { en: "bag", pl: "worek" }, dimension: "packaging" },
  { code: "BE", symbol: "bundle", name: { en: "bundle", pl: "wiązka" }, dimension: "packaging" },
  { code: "SO", symbol: "spool", name: { en: "spool", pl: "szpula" }, dimension: "packaging" },
  { code: "RO", symbol: "roll", name: { en: "roll", pl: "rolka" }, dimension: "packaging" },
  { code: "PF", symbol: "pallet", name: { en: "pallet", pl: "paleta" }, dimension: "packaging" },
  { code: "MGM", symbol: "mg", name: { en: "milligram", pl: "miligram" }, dimension: "mass" },
  { code: "GRM", symbol: "g", name: { en: "gram", pl: "gram" }, dimension: "mass" },
  { code: "KGM", symbol: "kg", name: { en: "kilogram", pl: "kilogram" }, dimension: "mass" },
  { code: "TNE", symbol: "t", name: { en: "tonne", pl: "tona" }, dimension: "mass" },
  { code: "MLT", symbol: "ml", name: { en: "millilitre", pl: "mililitr" }, dimension: "volume" },
  { code: "LTR", symbol: "l", name: { en: "litre", pl: "litr" }, dimension: "volume" },
  { code: "MTQ", symbol: "m³", name: { en: "cubic metre", pl: "metr sześcienny" }, dimension: "volume" },
  { code: "MMT", symbol: "mm", name: { en: "millimetre", pl: "milimetr" }, dimension: "length" },
  { code: "CMT", symbol: "cm", name: { en: "centimetre", pl: "centymetr" }, dimension: "length" },
  { code: "MTR", symbol: "m", name: { en: "metre", pl: "metr" }, dimension: "length" },
  { code: "MTK", symbol: "m²", name: { en: "square metre", pl: "metr kwadratowy" }, dimension: "area" },
  { code: "MIN", symbol: "min", name: { en: "minute", pl: "minuta" }, dimension: "time" },
  { code: "HUR", symbol: "h", name: { en: "hour", pl: "godzina" }, dimension: "time" },
  // Reports only (#239): a material's factor is its SU conversion, and nothing is entered in it.
  // Rec 20 has no code for it and keeps `Z…` codes for local use.
  { code: "ZSU", symbol: "SU", name: { en: "statistical unit", pl: "jednostka statystyczna" }, dimension: "statistical" },
];

/**
 * The one statistical unit (#239): what lets reports add up different products. A material's factor
 * is its conversion for this unit. It is never a base unit and never an entered unit.
 */
export const STATISTICAL_UNIT = "SU";

/** What a unit outside the registry is told, wherever a new unit is set; screens translate it by this text. */
export const UNIT_NOT_REGISTERED_MESSAGE = "Choose a unit from the list.";

/** What a new base unit `SU` is told (#239): SU is for reports only. Screens translate it by this text. */
export const STATISTICAL_BASE_UNIT_MESSAGE = "The statistical unit can't be a base unit.";

const SYMBOLS = new Set(UNITS.map((unit) => unit.symbol));

/** Whether `symbol` is in the registry: exact, so `KG` is not `kg`. */
export function isRegisteredUnit(symbol: string): boolean {
  return SYMBOLS.has(symbol);
}

/** Whether `symbol` is the statistical unit: exact, like `isRegisteredUnit`. */
export function isStatisticalUnit(symbol: string): boolean {
  return symbol === STATISTICAL_UNIT;
}

/**
 * A unit a record doesn't have yet: one of the registry's symbols, trimmed. Anything else, a blank
 * included, gets the one message, since the unit is chosen from a list (every symbol is a valid unit).
 */
export const registeredUnitSchema = z.string({ error: UNIT_NOT_REGISTERED_MESSAGE }).trim().refine(isRegisteredUnit, UNIT_NOT_REGISTERED_MESSAGE);
