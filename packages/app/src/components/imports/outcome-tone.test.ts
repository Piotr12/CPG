import { CircleCheck, CirclePlus, Equal, PenLine } from "lucide-react";
import { describe, expect, it } from "vitest";
import { IMPORT_RESULT_TONE, importPreviewTone } from "./outcome-tone";

describe("import outcome tones", () => {
  it("keeps a dry run's outcomes quiet, told apart by icon", () => {
    expect(importPreviewTone("create")).toEqual({ tone: "neutral", icon: CirclePlus });
    expect(importPreviewTone("update")).toEqual({ tone: "neutral", icon: PenLine });
    expect(importPreviewTone("unchanged")).toEqual({ tone: "neutral", icon: Equal });
  });

  it("marks a committed row as done", () => {
    expect(IMPORT_RESULT_TONE).toEqual({ tone: "success", icon: CircleCheck });
  });
});
