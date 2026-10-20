import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { STOCK_REASON_MESSAGE } from "../stock/stock-correction.schema";
import {
  TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE,
  TRANSFER_IMMUTABLE_MESSAGE,
  TRANSFER_SAME_LOCATION_MESSAGE,
  TRANSFER_SINGLE_MATERIAL_MESSAGE,
  transferCreateSchema,
  transferDatesSchema,
  transferListSchema,
  transferPostingSchema,
  transferUpdateBodySchema,
  transferWriteOffSchema,
} from "./transfer.schema";

const TRANSFER = {
  material: "00000001",
  source: "00000001",
  destination: "00000002",
  quantity: "100.0",
  unit: "kg",
  plannedDispatch: "2026-10-21",
  plannedArrival: "2026-10-23",
};

const fieldErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map(({ path, message }) => [path.join("."), message]));

describe("transferCreateSchema", () => {
  it("accepts one material between two locations, arrival on or after dispatch, and normalizes the quantity", () => {
    expect(transferCreateSchema.parse(TRANSFER)).toEqual({ ...TRANSFER, quantity: "100" });
    expect(transferCreateSchema.parse({ ...TRANSFER, plannedArrival: TRANSFER.plannedDispatch }).plannedArrival).toBe("2026-10-21");
  });

  it("refuses the same location twice and an arrival before the dispatch (TRF-026)", () => {
    expect(fieldErrors(transferCreateSchema.safeParse({ ...TRANSFER, destination: "00000001", plannedArrival: "2026-10-20" }))).toEqual({
      destination: TRANSFER_SAME_LOCATION_MESSAGE,
      plannedArrival: TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE,
    });
  });

  it("refuses a second material instead of dropping it (TRF-002)", () => {
    expect(fieldErrors(transferCreateSchema.safeParse({ ...TRANSFER, materials: ["00000001", "00000002"] }))).toEqual({ materials: TRANSFER_SINGLE_MATERIAL_MESSAGE });
    expect(fieldErrors(transferCreateSchema.safeParse({ ...TRANSFER, lines: [{ material: "00000002" }] }))).toEqual({ lines: TRANSFER_SINGLE_MATERIAL_MESSAGE });
    expect(transferCreateSchema.safeParse({ ...TRANSFER, material: ["00000001", "00000002"] }).success).toBe(false);
  });

  it("refuses a missing quantity or an impossible date", () => {
    expect(fieldErrors(transferCreateSchema.safeParse({ ...TRANSFER, quantity: "0", plannedDispatch: "2026-02-30" }))).toMatchObject({
      plannedDispatch: CALENDAR_DATE_MESSAGE,
    });
    expect(transferCreateSchema.safeParse({ ...TRANSFER, quantity: "0" }).success).toBe(false);
  });
});

describe("transferDatesSchema and transferUpdateBodySchema", () => {
  it("take both planned dates, arrival not earlier", () => {
    expect(transferDatesSchema.parse({ plannedDispatch: "2026-10-22", plannedArrival: "2026-10-22" })).toEqual({ plannedDispatch: "2026-10-22", plannedArrival: "2026-10-22" });
    expect(fieldErrors(transferDatesSchema.safeParse({ plannedDispatch: "2026-10-22", plannedArrival: "2026-10-21" }))).toEqual({
      plannedArrival: TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE,
    });
    expect(transferUpdateBodySchema.parse({ version: 2, plannedDispatch: "2026-10-22", plannedArrival: "2026-10-24" })).toEqual({
      version: 2,
      plannedDispatch: "2026-10-22",
      plannedArrival: "2026-10-24",
    });
  });

  it("refuse what a transfer never changes (spec Q3)", () => {
    const body = { version: 1, plannedDispatch: "2026-10-22", plannedArrival: "2026-10-24", material: "00000002", source: "00000003", destination: "00000004", quantity: "5", unit: "t" };
    expect(fieldErrors(transferUpdateBodySchema.safeParse(body))).toEqual({
      material: TRANSFER_IMMUTABLE_MESSAGE,
      source: TRANSFER_IMMUTABLE_MESSAGE,
      destination: TRANSFER_IMMUTABLE_MESSAGE,
      quantity: TRANSFER_IMMUTABLE_MESSAGE,
      unit: TRANSFER_IMMUTABLE_MESSAGE,
    });
  });
});

describe("posting schemas", () => {
  it("take a positive quantity and a unit, and a write-off a reason", () => {
    expect(transferPostingSchema.parse({ quantity: "60.50", unit: "kg", businessDate: "2026-01-01" })).toEqual({ quantity: "60.5", unit: "kg" });
    expect(transferPostingSchema.safeParse({ quantity: "-1", unit: "kg" }).success).toBe(false);
    expect(transferWriteOffSchema.parse({ quantity: "10", unit: "kg", reason: "  Lost on the road  " })).toEqual({ quantity: "10", unit: "kg", reason: "Lost on the road" });
    expect(fieldErrors(transferWriteOffSchema.safeParse({ quantity: "10", unit: "kg", reason: " " }))).toEqual({ reason: STOCK_REASON_MESSAGE });
  });
});

describe("transferListSchema", () => {
  it("reads a 1-based page and refuses other parameters", () => {
    expect(transferListSchema.parse({})).toEqual({ page: 1 });
    expect(transferListSchema.parse({ page: "3" })).toEqual({ page: 3 });
    expect(transferListSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(transferListSchema.safeParse({ status: "open" }).success).toBe(false);
  });
});
