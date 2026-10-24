import { Circle, CircleCheck, CircleDot, CircleMinus, CircleOff, CirclePlus, CircleX, Clock, Equal, History, Lock, Pencil, PenLine, TriangleAlert, Truck, Undo2 } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_TONES,
  IMPORT_PREVIEW_TONES,
  IMPORT_RESULT_TONE,
  MASTER_DATA_STATUS_TONES,
  REVERSAL_STATUS_TONES,
  TARGET_STATUS_TONES,
  TENANT_ACCESS_TONES,
  TRANSFER_STATUS_TONES,
  WASTE_TONE,
  documentStatusTone,
  importPreviewTone,
  masterDataStatusTone,
  reversalStatusTone,
  targetStatusTone,
  tenantAccessTone,
  transferStatusTone,
  type StatusToneSpec,
} from "./status-tone";

describe("status tone map", () => {
  // Spec "Components → Status tone map": colour marks attention and completion, resting states stay neutral.
  it.each([
    ["open", "neutral", CircleDot],
    ["completed", "success", CircleCheck],
    ["closed-early", "warning", CircleMinus],
    ["cancelled", "neutral", CircleX],
  ] as const)("shows a document that is %s as %s", (status, tone, icon) => {
    expect(documentStatusTone(status)).toEqual({ tone, icon });
    expect(transferStatusTone(status)).toEqual({ tone, icon });
  });

  it("maps every member of the four-state lifecycle, and transfers add in transit", () => {
    // DOCUMENT_STATES in db/src/entities/customer-orders/customer-order.entity.ts; SHIPMENT_STATUSES is a subset.
    expect(Object.keys(DOCUMENT_STATUS_TONES)).toEqual(["open", "completed", "closed-early", "cancelled"]);
    expect(Object.keys(TRANSFER_STATUS_TONES)).toEqual(["open", "completed", "closed-early", "cancelled", "inTransit"]);
    expect(transferStatusTone("inTransit")).toEqual({ tone: "neutral", icon: Truck });
  });

  it("shows a reversed movement or completion as neutral", () => {
    expect(Object.keys(REVERSAL_STATUS_TONES)).toEqual(["reversed"]);
    expect(reversalStatusTone("reversed")).toEqual({ tone: "neutral", icon: Undo2 });
  });

  it("maps every safety stock target state", () => {
    expect(Object.keys(TARGET_STATUS_TONES)).toEqual(["inEffect", "scheduled", "superseded"]);
    expect(targetStatusTone("inEffect")).toEqual({ tone: "success", icon: CircleCheck });
    expect(targetStatusTone("scheduled")).toEqual({ tone: "neutral", icon: Clock });
    expect(targetStatusTone("superseded")).toEqual({ tone: "neutral", icon: History });
  });

  it("keeps master data quiet, with a dashed edge for inactive", () => {
    expect(Object.keys(MASTER_DATA_STATUS_TONES)).toEqual(["active", "inactive"]);
    expect(masterDataStatusTone(true)).toEqual({ tone: "neutral", icon: Circle });
    expect(masterDataStatusTone(false)).toEqual({ tone: "neutral", icon: CircleOff, dashed: true });
  });

  it("warns that a tenant is read-only and leaves a writable one neutral", () => {
    expect(Object.keys(TENANT_ACCESS_TONES)).toEqual(["readOnly", "writable"]);
    expect(tenantAccessTone(true)).toEqual({ tone: "warning", icon: Lock });
    expect(tenantAccessTone(false)).toEqual({ tone: "neutral", icon: Pencil });
  });

  it("keeps a dry run's import outcomes quiet, told apart by icon, and marks a committed row as done", () => {
    expect(Object.keys(IMPORT_PREVIEW_TONES)).toEqual(["create", "update", "unchanged"]);
    expect(importPreviewTone("create")).toEqual({ tone: "neutral", icon: CirclePlus });
    expect(importPreviewTone("update")).toEqual({ tone: "neutral", icon: PenLine });
    expect(importPreviewTone("unchanged")).toEqual({ tone: "neutral", icon: Equal });
    expect(IMPORT_RESULT_TONE).toEqual({ tone: "success", icon: CircleCheck });
  });

  it("marks wasted completions as a warning, never danger", () => {
    expect(WASTE_TONE).toEqual({ tone: "warning", icon: TriangleAlert });
  });

  it("uses no danger and dashes only inactive", () => {
    const all = [DOCUMENT_STATUS_TONES, TRANSFER_STATUS_TONES, REVERSAL_STATUS_TONES, TARGET_STATUS_TONES, MASTER_DATA_STATUS_TONES, TENANT_ACCESS_TONES, IMPORT_PREVIEW_TONES].flatMap(
      (map): StatusToneSpec[] => Object.values(map),
    );
    all.push(IMPORT_RESULT_TONE, WASTE_TONE);
    expect(all.filter(({ tone }) => tone === "danger")).toEqual([]);
    expect(all.filter((spec) => "dashed" in spec)).toEqual([MASTER_DATA_STATUS_TONES.inactive]);
  });
});
