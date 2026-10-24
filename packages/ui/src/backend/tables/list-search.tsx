import { CircleAlert, Search } from "lucide-react";
import type { ComponentType, FormHTMLAttributes, ReactNode } from "react";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Label } from "../../components/label";

/** A link that navigates in the app (Next's `Link`); a plain `<a>` by default. */
export type LinkComponent = ComponentType<{ href: string; className?: string; children: ReactNode }>;
/** A GET form that navigates in the app (Next's `Form`); a plain `<form>` by default. */
export type FormComponent = ComponentType<FormHTMLAttributes<HTMLFormElement> & { action: string }>;

export interface ListSearchProps {
  /** The visible label, naming what is searched ("Search materials"). */
  label: string;
  /** What the box matches ("ID or description"), under the label. */
  hint?: string;
  /** The submitted search, shown back in the box. */
  query?: string;
  /** Why the submitted search was refused; the list is then shown unfiltered. */
  error?: string;
  /** The list's own path: the form submits `?q=` to it, which resets the page. */
  action: string;
  /** Query parameters a new search keeps, such as the sort. */
  keep?: Record<string, string | undefined>;
  submitLabel: string;
  form?: FormComponent;
}

/**
 * One labelled search box above a list (#217): a GET form, so the server searches every page, the
 * search lands in the URL, back and forward keep it, and it works before the page hydrates.
 */
export function ListSearch({ label, hint, query = "", error, action, keep = {}, submitLabel, form: Form = "form" as unknown as FormComponent }: ListSearchProps) {
  const describedBy = [hint && "list-search-hint", error && "list-search-error"].filter(Boolean).join(" ") || undefined;
  return (
    <Form action={action} role="search" className="mb-4 flex flex-col gap-2">
      <Label htmlFor="list-search">{label}</Label>
      {hint && (
        <p id="list-search-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          {/* Keyed by the search, so the box shows a new one after an in-app navigation (Clear search). */}
          <Input
            key={query}
            id="list-search"
            name="q"
            type="search"
            defaultValue={query}
            autoComplete="off"
            className="pl-8"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
        </div>
        {Object.entries(keep).map(([name, value]) => value !== undefined && <input key={name} type="hidden" name={name} value={value} />)}
        <Button type="submit" variant="outline" className="sm:shrink-0">
          {submitLabel}
        </Button>
      </div>
      {error && (
        <p id="list-search-error" className="flex gap-1 text-sm text-danger">
          <span className="flex h-5 shrink-0 items-center">
            <CircleAlert aria-hidden="true" className="size-3.5" />
          </span>
          {error}
        </p>
      )}
    </Form>
  );
}

export interface SearchResultLineProps {
  /** "5 materials match “steel”", in the reader's language. */
  children: ReactNode;
  /** The list without the search, keeping its sort. */
  clearHref: string;
  clearLabel: string;
  link?: LinkComponent;
}

/** The quiet line under a search: how many rows match, and the way back to the whole list. */
export function SearchResultLine({ children, clearHref, clearLabel, link: Link = "a" as unknown as LinkComponent }: SearchResultLineProps) {
  return (
    <p role="status" className="mb-2 text-sm text-muted-foreground">
      {children} ·{" "}
      <Link href={clearHref} className="text-foreground underline underline-offset-4">
        {clearLabel}
      </Link>
    </p>
  );
}
