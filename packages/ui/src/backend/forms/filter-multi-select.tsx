"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import { Checkbox } from "../../components/checkbox";
import { Input } from "../../components/input";
import { NativeSelectOption } from "../../components/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import { plural, type PluralForms } from "../../lib/plural";
import { Highlight } from "../tables/highlight";
import { matchOptions, type AutocompleteOption } from "./autocomplete";

export interface FilterMultiSelectOption extends AutocompleteOption {
  /** Still selectable, marked with `labels.inactive` (its history is still real). */
  inactive?: boolean;
}

/** What the multiselect says, in the reader's language: plain strings, so they can cross from a server page. */
export interface FilterMultiSelectLabels {
  /** The button while nothing is chosen, which means every option: "All finished products". */
  all: string;
  /** The button with more than one choice: "{count} selected". */
  selected: PluralForms;
  /** The search field's name and placeholder: "Search by ID or name". */
  search: string;
  /** Above the list: "{shown} of {total}". */
  shown: string;
  /** Adds every shown option to the choice. */
  selectShown: string;
  /** Empties the choice. */
  clear: string;
  /** The list's only row when nothing matches: "Nothing matches “{text}”." */
  noMatch: string;
  /** After the first chips: "+{count} more". */
  more: PluralForms;
  /** A chip's remove button: "Remove {name}". */
  remove: string;
  /** After an inactive option's name: "(inactive)". */
  inactive: string;
}

export interface FilterMultiSelectProps {
  /** The button's id, for its `<label htmlFor>`; also how the hydrating render finds the server's select. */
  id: string;
  /** The GET parameter each choice is submitted as, repeated. */
  name: string;
  options: FilterMultiSelectOption[];
  /** The values the page was opened with (the URL's); empty means all. */
  defaultValue: string[];
  labels: FilterMultiSelectLabels;
  /** The reader's language, for the plural forms. */
  locale?: string;
  disabled?: boolean;
  /** On the wrapper, for the filter form's layout. */
  className?: string;
  /** The id of the field's visible label, which then names the button and the list. */
  "aria-labelledby"?: string;
}

const noSubscription = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** At most this many chips show under the field; the rest are counted. */
const CHIPS = 4;

const labelOf = (option: AutocompleteOption) => `${option.code} — ${option.name}`;

/** The select's text for an option, with its detail and inactive marker in brackets. */
function selectLabel(option: FilterMultiSelectOption, inactive: string) {
  return [labelOf(option), option.detail && `(${option.detail})`, option.inactive && inactive].filter(Boolean).join(" ");
}

/** The values the hydrating render keeps: what the reader chose in the server's select, or the URL's. */
function initialValue(hydrated: boolean, id: string, defaultValue: string[]) {
  // While hydrating, the server's select is still in the document and holds what the reader may
  // already have chosen. A later client mount (a new `key` after a soft navigation) must not read the
  // element there: it is the previous field's button (lesson 2026-10-25).
  const select = hydrated || typeof document === "undefined" ? null : (document.getElementById(id) as HTMLSelectElement | null);
  return select ? [...select.selectedOptions].map((option) => option.value) : defaultValue;
}

/**
 * A filter form's choice of any number of records (#240), the multiselect counterpart of
 * `FilterAutocomplete`. The server and the hydrating render show a native `<select multiple>`, so the
 * GET form works before JavaScript loads (or without it); once hydrated it is a button opening a
 * searchable list of checkboxes, and the choice submits as one hidden input per value under the same
 * `name`. A choice made in the select before hydration carries over. Key it by `defaultValue`, so a
 * navigation to another filter starts afresh.
 */
export function FilterMultiSelect({ id, name, options, defaultValue, labels, locale = "en", disabled, className, ...aria }: FilterMultiSelectProps) {
  const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
  const ownId = useId();
  const listId = `${ownId}-list`;
  const [chosen, setChosen] = useState(() => new Set(initialValue(hydrated, id, defaultValue)));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const matched = new Set(matchOptions(options, text).map((option) => option.value));
    return options.filter((option) => matched.has(option.value));
  }, [options, text]);
  // In the options' order, whatever order they were chosen in; a value no option has is dropped.
  const selection = options.filter((option) => chosen.has(option.value));

  // Radix closes the popover on Escape from the topmost layer, but other capture-phase listeners (a
  // dialog around the form, `CrudForm`) see the key first: while open, claim Escape so it closes only
  // the popover (lesson "A popup inside a Radix dialog").
  useEffect(() => {
    if (!open) return;
    const claimEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node && content.current?.contains(event.target))) return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", claimEscape, { capture: true });
    return () => window.removeEventListener("keydown", claimEscape, { capture: true });
  }, [open]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setText("");
    setActive(0);
  }

  function toggle(value: string) {
    const next = new Set(chosen);
    if (!next.delete(value)) next.add(value);
    setChosen(next);
  }

  function selectShown() {
    setChosen(new Set([...chosen, ...matches.map((option) => option.value)]));
  }

  function remove(value: string) {
    toggle(value);
    // The chip's button goes away with it, so focus goes back to the field.
    trigger.current?.focus();
  }

  /** Moves the active option, and focus with it. */
  function moveTo(index: number) {
    setActive(index);
    list.current?.querySelectorAll<HTMLElement>("[role=option]")[index]?.focus();
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      moveTo(0);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = matches.length - 1;
    if (event.key === "ArrowDown") moveTo(Math.min(active + 1, last));
    else if (event.key === "ArrowUp" && active === 0) search.current?.focus();
    else if (event.key === "ArrowUp") moveTo(active - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(last);
    else if (event.key === " " || event.key === "Enter") toggle(matches[active].value);
    else return;
    event.preventDefault();
  }

  if (!hydrated) {
    return (
      <div className={className}>
        <select
          id={id}
          name={name}
          multiple
          defaultValue={defaultValue}
          disabled={disabled}
          aria-labelledby={aria["aria-labelledby"]}
          className="w-full min-w-0 rounded-md border border-input bg-transparent p-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {selectLabel(option, labels.inactive)}
            </NativeSelectOption>
          ))}
        </select>
      </div>
    );
  }

  const summary = selection.length === 0 ? labels.all : selection.length === 1 ? labelOf(selection[0]) : plural(locale, selection.length, labels.selected);

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={trigger}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-labelledby={aria["aria-labelledby"] ? `${aria["aria-labelledby"]} ${id}-summary` : undefined}
            className="w-full justify-between font-normal"
          >
            <span id={`${id}-summary`} className="truncate">
              {summary}
            </span>
            <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent ref={content} align="start" className="w-(--radix-popover-trigger-width) min-w-72 gap-0 p-0">
          <div className="border-b border-border p-2">
            <Input
              ref={search}
              type="search"
              aria-label={labels.search}
              aria-controls={listId}
              placeholder={labels.search}
              autoComplete="off"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 text-xs text-muted-foreground">
            <span role="status" aria-live="polite">
              {labels.shown.replaceAll("{shown}", String(matches.length)).replaceAll("{total}", String(options.length))}
            </span>
            <span className="flex gap-3">
              <Button type="button" variant="link" size="xs" className="h-auto px-0" disabled={matches.length === 0} onClick={selectShown}>
                {labels.selectShown}
              </Button>
              <Button type="button" variant="link" size="xs" className="h-auto px-0" disabled={chosen.size === 0} onClick={() => setChosen(new Set())}>
                {labels.clear}
              </Button>
            </span>
          </div>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={aria["aria-labelledby"]}
            onKeyDown={onListKeyDown}
            className="max-h-72 overflow-y-auto p-1"
          >
            {matches.map((option, index) => {
              const checked = chosen.has(option.value);
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={checked}
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => {
                    setActive(index);
                    toggle(option.value);
                  }}
                  className="flex cursor-default items-start gap-2 rounded-sm px-2 py-2 outline-none hover:bg-muted focus-visible:bg-accent focus-visible:text-accent-foreground"
                >
                  <span className="flex h-5 shrink-0 items-center">
                    <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <span className="font-mono">
                        <Highlight text={option.code} query={text} />
                      </span>
                      <span className="text-muted-foreground"> — </span>
                      <Highlight text={option.name} query={text} />
                      {option.inactive && <span className="text-muted-foreground"> {labels.inactive}</span>}
                    </span>
                    {option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}
                  </span>
                </li>
              );
            })}
            {matches.length === 0 && <li className="px-2 py-2 text-muted-foreground">{labels.noMatch.replaceAll("{text}", text.trim())}</li>}
          </ul>
        </PopoverContent>
      </Popover>
      {selection.map((option) => (
        <input key={option.value} type="hidden" name={name} value={option.value} />
      ))}
      {selection.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {selection.slice(0, CHIPS).map((option) => (
            <li key={option.value}>
              <Badge variant="secondary" className="h-6 max-w-64 gap-1 overflow-visible pr-1 font-normal">
                <span className="min-w-0 truncate">{labelOf(option)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  disabled={disabled}
                  aria-label={labels.remove.replaceAll("{name}", labelOf(option))}
                  onClick={() => remove(option.value)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </Badge>
            </li>
          ))}
          {selection.length > CHIPS && (
            <li>
              <Badge variant="outline" className="h-6 font-normal text-muted-foreground">
                {plural(locale, selection.length - CHIPS, labels.more)}
              </Badge>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
