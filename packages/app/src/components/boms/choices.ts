import type { MaterialSummary } from "@cpg/core";
import { materialOptions } from "../materials/material-picker";
import type { ComponentChoice, OutputChoice } from "./recipe-form";

/*
 * What the recipe form may pick, as material picker options (#217): an output is an active
 * intermediate or finished material, a component an active raw or intermediate one (R02, MAT-029).
 * Each option shows the base unit, which a form hint can't follow.
 */

/** The materials a new BOM may make. */
export function outputChoices(materials: MaterialSummary[]): OutputChoice[] {
  const outputs = materials.filter(({ active, type }) => active && type !== "raw");
  return materialOptions(outputs).map((option, index) => ({ ...option, baseUnit: outputs[index].baseUnit }));
}

/**
 * The materials a line may pick, with the units each may be entered in (`units`, from
 * `MaterialService.listUnits`). `kept` are the current revision's components: they stay offered
 * when inactive, since an edit may keep them (spec Q10).
 */
export function componentChoices(materials: MaterialSummary[], units: Record<string, string[]>, kept: readonly string[] = []): ComponentChoice[] {
  const components = materials.filter(({ id, active, type }) => type !== "finished" && (active || kept.includes(id)));
  return materialOptions(components).map((option) => ({ ...option, units: units[option.value] }));
}
