import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** The page's one `h1`: `{Concept} — {Tenant}`, `{Concept}` or `{Concept singular} {ID}`. */
  title: ReactNode;
  /** A short intro, at most one prose line length wide. */
  description?: ReactNode;
  /** The page's actions, at most one of them solid; they drop under the title below `sm`. */
  actions?: ReactNode;
  /** Beside the title: a `StatusBadge` or tags. */
  meta?: ReactNode;
}

/** Every admin page's header: title, optional state, intro and actions, 24 px above the content. */
export function PageHeader({ title, description, actions, meta }: PageHeaderProps) {
  return (
    <div data-slot="page-header" className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
          {meta}
        </div>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
