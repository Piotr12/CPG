/** One demonstration requisition, as the Test seed creates it (D06): references by business ID, quantity as entered. */
export interface DemoRequisition {
  material: string;
  location: string;
  quantity: string;
  unit: string;
  requiredDate: string;
}

/** One demonstration purchase-order line; `requisition` is the 1-based position in `DEMO_REQUISITIONS`, if it converts one. */
export interface DemoOrderLine {
  material: string;
  quantity: string;
  unit: string;
  plannedDate: string;
  requisition?: number;
}

export interface DemoOrder {
  supplier: string;
  location: string;
  lines: DemoOrderLine[];
}

/**
 * The requisitions a fresh Test tenant starts with (TEN-001, D06), in ID order, on the demo
 * materials and locations: 100 kg of steel sheet, and 5 cases of bolts (60 each, MAT-019).
 */
export const DEMO_REQUISITIONS: readonly DemoRequisition[] = [
  { material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2026-11-02" },
  { material: "00000002", location: "00000001", quantity: "5", unit: "case", requiredDate: "2026-11-09" },
];

/**
 * The purchase orders a fresh Test tenant starts with: one to the first supplier that converts 60 of
 * the steel requisition's 100 kg (BUY-003) and buys paint directly (BUY-002), on two dates (BUY-008).
 */
export const DEMO_ORDERS: readonly DemoOrder[] = [
  {
    supplier: "00000001",
    location: "00000001",
    lines: [
      { material: "00000001", quantity: "60", unit: "kg", plannedDate: "2026-11-04", requisition: 1 },
      { material: "00000003", quantity: "20", unit: "l", plannedDate: "2026-11-06" },
    ],
  },
];
