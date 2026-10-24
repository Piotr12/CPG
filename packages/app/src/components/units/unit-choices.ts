import { UNIT_DIMENSIONS, UNITS, isRegisteredUnit } from "@cpg/core/validators/units/unit-registry";
import type { CrudField, CrudOption } from "@cpg/ui/backend/forms/crud-form";
import type { Messages } from "../../i18n/messages/en";

/** The registry's units grouped by dimension, labelled in the reader's language: plain data for a client form. */
export interface UnitChoices {
  groups: { label: string; options: CrudOption[] }[];
  /** "{unit} (not in the unit list)", for a stored unit the registry doesn't have. */
  notListed: string;
}

/** Built on the server from the reader's locale and dictionary (#217). */
export function unitChoices(locale: "en" | "pl", labels: Messages["units"]): UnitChoices {
  return {
    groups: UNIT_DIMENSIONS.map((dimension) => ({
      label: labels.dimensions[dimension],
      options: UNITS.filter((unit) => unit.dimension === dimension).map(({ symbol, name }) => ({
        value: symbol,
        label: name[locale] === symbol ? symbol : `${symbol} — ${name[locale]}`,
      })),
    })),
    notListed: labels.notListed,
  };
}

/**
 * A unit select's choices: the registry's groups, with `disabled` units (symbol → why) left in
 * place but unselectable, and `current`, when the registry lacks it, first, so a select never
 * silently submits another unit than the one stored (lesson 2026-10-23).
 */
export function unitSelect(choices: UnitChoices, { current, disabled = {} }: { current?: string; disabled?: Record<string, string> } = {}): Pick<CrudField, "options" | "groups"> {
  return {
    options: current && !isRegisteredUnit(current) ? [{ value: current, label: choices.notListed.replaceAll("{unit}", current) }] : [],
    groups: choices.groups.map((group) => ({
      label: group.label,
      options: group.options.map((option) =>
        disabled[option.value] ? { ...option, label: `${option.label} (${disabled[option.value]})`, disabled: true } : option,
      ),
    })),
  };
}
