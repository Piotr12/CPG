"use client";

import { useActionState } from "react";
import type { Locale, Theme } from "@cpg/core";
import { Button } from "@cpg/ui/components/button";
import { LANGUAGE_NAMES } from "../../i18n/language-names";
import type { Messages } from "../../i18n/messages/en";

export interface PreferencesState {
  error?: string;
}

interface PreferencesControlsProps {
  locale: Locale;
  theme: Theme;
  labels: Messages["preferences"];
  action: (state: PreferencesState, formData: FormData) => Promise<PreferencesState>;
}

const LOCALE_OPTIONS = Object.entries(LANGUAGE_NAMES) as [Locale, string][];
const THEME_OPTIONS: Theme[] = ["light", "dark"];

/**
 * The language and theme switches in the menu's account controls. Each option is a submit button carrying
 * its own `name`/`value`, so one form serves both groups and a click sends exactly one change.
 */
export function PreferencesControls({ locale, theme, labels, action }: PreferencesControlsProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <OptionGroup label={labels.language}>
        {LOCALE_OPTIONS.map(([value, name]) => (
          <Option key={value} name="locale" value={value} isCurrent={value === locale} isPending={isPending} lang={value}>
            {name}
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label={labels.theme}>
        {THEME_OPTIONS.map((value) => (
          <Option key={value} name="theme" value={value} isCurrent={value === theme} isPending={isPending}>
            {labels[value]}
          </Option>
        ))}
      </OptionGroup>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {children}
    </div>
  );
}

interface OptionProps {
  name: "locale" | "theme";
  value: string;
  isCurrent: boolean;
  isPending: boolean;
  lang?: string;
  children: React.ReactNode;
}

function Option({ name, value, isCurrent, isPending, lang, children }: OptionProps) {
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      lang={lang}
      size="sm"
      variant={isCurrent ? "secondary" : "ghost"}
      aria-pressed={isCurrent}
      disabled={isPending}
    >
      {children}
    </Button>
  );
}
