import type { MaterialType } from "../../validators/materials/material-fields.schema";

/** One demonstration material and its conversions, as the Test seed creates it (D06). */
export interface DemoMaterial {
  type: MaterialType;
  description: string;
  baseUnit: string;
  conversions: { unit: string; numerator: string; denominator: string }[];
}

/**
 * The materials a fresh Test tenant starts with (TEN-001, D06), in ID order: a small red cabinet
 * and what it's made of, so the BOM story (#26) can build its demonstration recipes on them. Every
 * type, and the acceptance catalogue's conversions (case = 12 each, tonne = 1000 kg), appear once.
 */
export const DEMO_MATERIALS: readonly DemoMaterial[] = [
  {
    type: "raw",
    description: "Steel sheet 2 mm",
    baseUnit: "kg",
    conversions: [{ unit: "t", numerator: "1000", denominator: "1" }],
  },
  {
    type: "raw",
    description: "Bolt M8",
    baseUnit: "each",
    conversions: [
      { unit: "case", numerator: "12", denominator: "1" },
      { unit: "box", numerator: "100", denominator: "1" },
    ],
  },
  {
    type: "raw",
    description: "Paint, red",
    baseUnit: "l",
    conversions: [{ unit: "ml", numerator: "1", denominator: "1000" }],
  },
  { type: "intermediate", description: "Painted side panel", baseUnit: "each", conversions: [] },
  {
    type: "finished",
    description: "Cabinet, red",
    baseUnit: "each",
    conversions: [{ unit: "pallet", numerator: "20", denominator: "1" }],
  },
  {
    type: "raw",
    description: "Cardboard box",
    baseUnit: "each",
    conversions: [{ unit: "bundle", numerator: "25", denominator: "1" }],
  },
];
