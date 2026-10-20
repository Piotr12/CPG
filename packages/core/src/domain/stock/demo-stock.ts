/** Fixed opening stock for Test's existing demo masters; every row becomes a ledger posting (D06). */
export const DEMO_STOCK = [
  { material: "00000001", location: "00000001", quantity: "500", unit: "kg" },
  { material: "00000002", location: "00000001", quantity: "1000", unit: "each" },
  { material: "00000003", location: "00000001", quantity: "40", unit: "l" },
  { material: "00000004", location: "00000001", quantity: "25", unit: "each" },
  { material: "00000005", location: "00000002", quantity: "10", unit: "each" },
  { material: "00000006", location: "00000001", quantity: "50", unit: "each" },
] as const;
