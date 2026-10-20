import type { MaterialSummary } from "@cpg/core";
import type { ComponentChoice, OutputChoice } from "./recipe-form";

/*
 * What the recipe form may pick: an output is an active intermediate or finished material, a
 * component an active raw or intermediate one (R02, MAT-029). Labels name the base unit, which a
 * form hint can't follow.
 */

const label = ({ id, description, baseUnit }: MaterialSummary) => `${id} — ${description} (${baseUnit})`;

/** The materials a new BOM may make. */
export function outputChoices(materials: MaterialSummary[]): OutputChoice[] {
  return materials
    .filter(({ active, type }) => active && type !== "raw")
    .map((material) => ({ value: material.id, label: label(material), description: material.description, baseUnit: material.baseUnit }));
}

/**
 * The materials a line may pick, with the units each may be entered in (`units`, from
 * `MaterialService.listUnits`). `kept` are the current revision's components: they stay offered
 * when inactive, since an edit may keep them (spec Q10).
 */
export function componentChoices(materials: MaterialSummary[], units: Record<string, string[]>, kept: readonly string[] = []): ComponentChoice[] {
  return materials
    .filter(({ id, active, type }) => type !== "finished" && (active || kept.includes(id)))
    .map((material) => ({ value: material.id, label: label(material), units: units[material.id] }));
}
