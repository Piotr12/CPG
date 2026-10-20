/** One demonstration BOM, as the Test seed creates it (D06): its output, recipe and lines as entered. */
export interface DemoBom {
  output: string;
  priority: number;
  validFrom: string;
  validThrough: string | null;
  components: { material: string; quantity: string; unit: string }[];
}

/**
 * The BOMs a fresh Test tenant starts with (TEN-001, D06), in ID order, on the demo materials: the
 * painted side panel, and two alternatives for the red cabinet. The second enters its bolts as 2
 * cases, so the demo shows a converted line (24 each, MAT-019), and ends in 2026.
 */
export const DEMO_BOMS: readonly DemoBom[] = [
  {
    output: "00000004",
    priority: 1,
    validFrom: "2026-01-01",
    validThrough: null,
    components: [
      { material: "00000001", quantity: "4.5", unit: "kg" },
      { material: "00000003", quantity: "250", unit: "ml" },
    ],
  },
  {
    output: "00000005",
    priority: 1,
    validFrom: "2026-01-01",
    validThrough: null,
    components: [
      { material: "00000004", quantity: "4", unit: "each" },
      { material: "00000002", quantity: "16", unit: "each" },
      { material: "00000006", quantity: "1", unit: "each" },
    ],
  },
  {
    output: "00000005",
    priority: 2,
    validFrom: "2026-01-01",
    validThrough: "2026-12-31",
    components: [
      { material: "00000004", quantity: "4", unit: "each" },
      { material: "00000002", quantity: "2", unit: "case" },
      { material: "00000006", quantity: "1", unit: "each" },
    ],
  },
];
