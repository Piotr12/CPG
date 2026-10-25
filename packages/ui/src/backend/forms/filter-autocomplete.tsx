"use client";

import { useState, useSyncExternalStore } from "react";
import { NativeSelect, NativeSelectOption } from "../../components/native-select";
import { Autocomplete, type AutocompleteLabels, type AutocompleteOption } from "./autocomplete";

export interface FilterAutocompleteProps {
  /** The field's id, for its `<label htmlFor>`; also how the hydrating render finds the server's select. */
  id: string;
  /** The GET parameter the choice is submitted as. */
  name: string;
  options: AutocompleteOption[];
  /** The value the page was opened with (the URL's), or "". */
  defaultValue: string;
  /** The empty choice ("Any", "All"), also the empty field's placeholder; without one there is none. */
  emptyLabel?: string;
  labels: AutocompleteLabels;
  locale?: string;
  /** The empty field's placeholder when there is no `emptyLabel`. */
  placeholder?: string;
  /** On the wrapper, for the filter form's layout. */
  className?: string;
  "aria-labelledby"?: string;
}

const noSubscription = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** The select's text for an option: what the autocomplete shows, with its detail in brackets. */
const selectLabel = ({ code, name, detail }: AutocompleteOption) => `${code} — ${name}${detail ? ` (${detail})` : ""}`;

/**
 * A filter form's choice from a list too long for a select (#222). The server and the hydrating render
 * show a native select, so the GET form works before JavaScript loads (or without it); once hydrated
 * it is an `Autocomplete` submitting the same `name`. A choice made in the select before hydration
 * carries over. Key it by `defaultValue`, so a navigation to another filter starts afresh.
 */
export function FilterAutocomplete({ id, name, options, defaultValue, emptyLabel, labels, locale, placeholder, className, ...aria }: FilterAutocompleteProps) {
  const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
  // On the client this first runs while hydrating, with the server's select still in the document:
  // it holds what the reader may already have chosen.
  const [value, setValue] = useState(() =>
    typeof document === "undefined" ? defaultValue : (document.getElementById(id) as HTMLSelectElement | null)?.value ?? defaultValue,
  );

  return (
    <div className={className}>
      {hydrated ? (
        <Autocomplete
          id={id}
          name={name}
          options={options}
          value={value}
          onChange={setValue}
          labels={labels}
          locale={locale}
          placeholder={emptyLabel ?? placeholder}
          aria-labelledby={aria["aria-labelledby"]}
        />
      ) : (
        <NativeSelect id={id} name={name} defaultValue={defaultValue} className="w-full" aria-labelledby={aria["aria-labelledby"]}>
          {emptyLabel !== undefined && <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>}
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {selectLabel(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}
