import { UNIT_DIMENSIONS, UNITS, isRegisteredUnit, isStatisticalUnit } from "@cpg/core/validators/units/unit-registry";
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

interface UnitSelectOptions {
  /** The stored unit, kept first when the select wouldn't offer it. */
  current?: string;
  /** Units shown but unselectable, each with why (symbol → reason). */
  disabled?: Record<string, string>;
  /** Leave out the report-only statistical unit, as a base unit select must (#239). */
  physicalOnly?: boolean;
}

/**
 * A unit select's choices: the registry's groups, with `disabled` units left in place but
 * unselectable, and `current`, when the registry lacks it or `physicalOnly` leaves it out, first, so
 * a select never silently submits another unit than the one stored (lesson 2026-10-23).
 */
export function unitSelect(choices: UnitChoices, { current, disabled = {}, physicalOnly = false }: UnitSelectOptions = {}): Pick<CrudField, "options" | "groups"> {
  const offered = (unit: string) => !physicalOnly || !isStatisticalUnit(unit);
  const listed = choices.groups.flatMap((group) => group.options).find((option) => option.value === current);
  const keep = current && !(isRegisteredUnit(current) && offered(current));
  return {
    options: keep ? [{ value: current, label: listed?.label ?? choices.notListed.replaceAll("{unit}", current) }] : [],
    groups: choices.groups
      .map((group) => ({
        label: group.label,
        options: group.options
          .filter((option) => offered(option.value))
          .map((option) => (disabled[option.value] ? { ...option, label: `${option.label} (${disabled[option.value]})`, disabled: true } : option)),
      }))
      .filter((group) => group.options.length > 0),
  };
}
