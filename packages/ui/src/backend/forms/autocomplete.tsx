"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "../../components/input";
import { cn } from "../../lib/utils";
import { plural, type PluralForms } from "../../lib/plural";
import { Highlight, highlightWords } from "../tables/highlight";

export interface AutocompleteOption {
  value: string;
  /** The business ID: matched, and shown in Geist Mono. */
  code: string;
  /** The name: matched, and shown after the code. */
  name: string;
  /** Quiet trailing detail, not matched (a material's base unit). */
  detail?: string;
}

/** What the autocomplete says, in the reader's language: plain strings with `{count}` and `{text}`. */
export interface AutocompleteLabels {
  /** Announced while the list is open: "{count} results". */
  results: PluralForms;
  /** The list's only row when nothing matches: "Nothing matches “{text}”." */
  noMatch: string;
  /** Under the shown rows when there are more: "{count} more: keep typing to narrow the list". */
  more: PluralForms;
  /** Under the field when typed text matched no choice: "Choose a material from the list." */
  refused: string;
}

export interface AutocompleteProps {
  id?: string;
  /** Submitted in a hidden input, when the autocomplete sits in a plain form. */
  name?: string;
  options: AutocompleteOption[];
  /** The chosen option's `value`, or "" while nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
  labels: AutocompleteLabels;
  /** The reader's language, for the plural forms. */
  locale?: string;
  placeholder?: string;
  disabled?: boolean;
  /** At most this many rows show; the count announced is the full count. */
  limit?: number;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

const labelOf = (option: AutocompleteOption) => `${option.code} — ${option.name}`;

/** The list's tallest height, in px (`max-h-80`). */
const LIST_MAX = 320;
/** Below this much room under the field, the list opens upward if there is more room above. */
const LIST_MIN = 160;
/** The gap kept between the list and the edge of what clips it. */
const EDGE = 8;

/** Where the open list goes, and how tall it may be. */
export interface ListPlacement {
  side: "below" | "above";
  maxHeight: number;
}

/**
 * The list's side and height for a field at `field` inside `bounds` (the box that clips it: a
 * scrolling dialog, or the viewport). It opens below, as tall as there is room for; with less than
 * `LIST_MIN` px below and more room above, it opens upward instead, so a field low in a tall dialog
 * doesn't push its list past the dialog's edge (#217).
 */
export function placeList(field: { top: number; bottom: number }, bounds: { top: number; bottom: number }): ListPlacement {
  const below = bounds.bottom - field.bottom - EDGE;
  const above = field.top - bounds.top - EDGE;
  if (below >= LIST_MIN || below >= above) return { side: "below", maxHeight: Math.max(Math.min(LIST_MAX, below), 0) };
  return { side: "above", maxHeight: Math.min(LIST_MAX, above) };
}

/** The box that clips `element`: its nearest ancestor that scrolls or hides overflow, else the viewport. */
export function clipBounds(element: HTMLElement): { top: number; bottom: number } {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
      const { top, bottom } = parent.getBoundingClientRect();
      return { top, bottom };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

/** Every word of `text` in the option's code or name, ignoring case. */
export function matchOptions(options: AutocompleteOption[], text: string): AutocompleteOption[] {
  const words = highlightWords(text);
  return options.filter((option) => {
    const haystack = `${option.code} ${option.name}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * A combobox for a choice from a list too long for a select (#217): the WAI-ARIA 1.2 "combobox with
 * listbox popup" pattern after GOV.UK's accessible-autocomplete, no library. Every typed word must
 * appear in an option's code or name; ↑/↓ move, Enter chooses, Escape closes the list (and only the
 * list, inside a dialog). Text that isn't a choice never reaches the form: leaving the field with it
 * clears the value and says so.
 */
export function Autocomplete({
  id,
  name,
  options,
  value,
  onChange,
  labels,
  locale = "en",
  placeholder,
  disabled,
  limit = 20,
  ...aria
}: AutocompleteProps) {
  const ownId = useId();
  const inputId = id ?? `${ownId}-input`;
  const listId = `${ownId}-list`;
  const refusedId = `${ownId}-refused`;
  const chosen = options.find((option) => option.value === value);
  const [text, setText] = useState(chosen ? labelOf(chosen) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [refused, setRefused] = useState(false);
  const [placement, setPlacement] = useState<ListPlacement>({ side: "below", maxHeight: LIST_MAX });
  // The value this field last showed or chose; a different `value` was set from outside (a reset,
  // another field), so the field shows its label instead of what was typed.
  const [synced, setSynced] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  if (value !== synced) {
    setSynced(value);
    setText(chosen ? labelOf(chosen) : "");
    setRefused(false);
  }

  // Typing filters; an untouched field (its text is the chosen label) offers every option.
  const typed = chosen && text === labelOf(chosen) ? "" : text;
  const matches = useMemo(() => matchOptions(options, typed), [options, typed]);
  const shown = matches.slice(0, limit);

  // A dialog listens for Escape on the document in the capture phase, before this field: while the
  // list is open, claim Escape first so it closes the list and not the dialog.
  useEffect(() => {
    if (!open) return;
    const claimEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.target !== input.current) return;
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    };
    window.addEventListener("keydown", claimEscape, { capture: true });
    return () => window.removeEventListener("keydown", claimEscape, { capture: true });
  }, [open]);

  /** Opens the list on the side of the field with room for it. */
  function openList() {
    if (!open && input.current) setPlacement(placeList(input.current.getBoundingClientRect(), clipBounds(input.current)));
    setOpen(true);
  }

  /** Tells the form, remembering the value as this field's own. */
  function emit(next: string) {
    setSynced(next);
    if (next !== value) onChange(next);
  }

  function choose(option: AutocompleteOption) {
    emit(option.value);
    setText(labelOf(option));
    setOpen(false);
    setActive(-1);
    setRefused(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openList();
      setActive((current) => Math.min(current + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && shown[active]) {
      // Chooses instead of submitting the form.
      event.preventDefault();
      choose(shown[active]);
    }
  }

  function onBlur() {
    setOpen(false);
    setActive(-1);
    if (text.trim() === "") {
      emit("");
      setRefused(false);
    } else if (!chosen || labelOf(chosen) !== text) {
      emit("");
      setRefused(true);
    }
  }

  const status = !open ? "" : matches.length === 0 ? labels.noMatch.replaceAll("{text}", text.trim()) : plural(locale, matches.length, labels.results);
  const describedBy = [aria["aria-describedby"], refused && refusedId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative">
      <Input
        ref={input}
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"] || refused || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          openList();
          setActive(0);
          setRefused(false);
        }}
        onFocus={openList}
        onClick={openList}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      <ul
        id={listId}
        role="listbox"
        aria-label={aria["aria-label"]}
        hidden={!open}
        data-side={placement.side}
        style={{ maxHeight: placement.maxHeight }}
        className={cn(
          "absolute left-0 z-50 w-full min-w-full overflow-y-auto rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 sm:w-max sm:max-w-lg",
          placement.side === "below" ? "top-full mt-1" : "bottom-full mb-1",
        )}
      >
        {shown.map((option, index) => (
          <li
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              // Keeps focus in the field, so its blur doesn't refuse the click.
              event.preventDefault();
              choose(option);
            }}
            onMouseMove={() => setActive(index)}
            className={cn("flex cursor-default items-baseline gap-2 rounded-sm px-2 py-1", index === active && "bg-accent text-accent-foreground")}
          >
            <span className="font-mono whitespace-nowrap">
              <Highlight text={option.code} query={typed} />
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              —
            </span>
            <span className="min-w-0 flex-1 truncate">
              <Highlight text={option.name} query={typed} />
            </span>
            {option.detail && <span className="shrink-0 text-xs text-muted-foreground">{option.detail}</span>}
          </li>
        ))}
        {matches.length === 0 && <li className="px-2 py-1 text-muted-foreground">{labels.noMatch.replaceAll("{text}", text.trim())}</li>}
        {matches.length > limit && (
          <li aria-hidden="true" className="mt-1 border-t border-border px-2 pt-1 text-xs text-muted-foreground">
            {plural(locale, matches.length - limit, labels.more)}
          </li>
        )}
      </ul>
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
      {refused && (
        <p id={refusedId} className="mt-2 flex gap-1 text-sm text-danger">
          <span className="flex h-5 shrink-0 items-center">
            <CircleAlert aria-hidden="true" className="size-3.5" />
          </span>
          {labels.refused}
        </p>
      )}
    </div>
  );
}
