# Common brief — three design proposals for tables and data entry

Read this first, then your own `brief-<letter>-*.md` in this folder.

## What the owner asked for

> Improve how tables are presented (sort on column click, potentially a full-text search bar above the
> table) and how data entry is done (only UOMs that exist instead of free text, potentially automated
> completion/suggestion on entry). Three distinct approaches; one GitHub issue each, with screenshotted
> mockups and a no-bullshit TL;DR of what the new design system brings. The owner decides after seeing them.

Three workers run in parallel, one per approach (A, B, C). **You own exactly one.** Make yours as
convincing and as *different* from the other two as your brief says; don't drift toward a middle ground.

## Where things stand today (main @ 28fcdd89)

- Design system v1 is implemented: `.ai/specs/implemented/2026-10-24--0842UTC-design-system-v1.md`.
  Tokens in `packages/ui/src/styles/globals.css`; neutral surfaces, one ink action colour, hue only for
  tenant/success/warning/danger; 14 px text, 32 px controls; `PageHeader`, `StatusBadge`, `Callout`,
  `DataTable`, `CrudForm`. Your proposal **extends** v1 — keep its tokens, principles and spacing grid;
  never introduce palette literals, gradients, pills, emoji (see the spec's "Decoration" section).
- `packages/ui/src/backend/tables/data-table.tsx`: columns by `kind`/`priority`, sticky first column,
  `rowTone`, server-rendered `pagination`. Its doc comment: *"Sorting and filtering are added with the
  first list that needs them."* Lists are **paged on the server** (lesson 2026-10-24 "Paging a list"), so
  a real sort/search must run in the service, not on one page in the browser. Say how your proposal
  handles that in the issue.
- `packages/ui/src/backend/forms/crud-form.tsx`: fields are `text | password | select | date`; selects are
  `NativeSelect`.
- Units are **free text**: `unitSchema` in `packages/core/src/validators/materials/material-fields.schema.ts`
  is a trimmed string matched by a regex. Entered in `components/materials/material-form-fields.ts`
  (material `baseUnit`, conversion `unit`), BOM component lines (`components/boms/recipe-form.tsx`),
  purchase-order lines and shipments. There is no unit registry.
- References to other records (BOM output/components, order lines) are `NativeSelect`s of choices.
- Good screens to mock: Materials list `/admin/test/materials`, Create material dialog, a material's
  Add conversion dialog (`/admin/test/materials/<id>`), the BOM editor (`/admin/test/boms/...`),
  a document list such as `/admin/test/production-orders`.

## How to build the mockups

The mockups are **screenshots of a working prototype in the real app**, so they use the real tokens and
data. This is a throwaway prototype branch: it is never merged, so **no unit tests, no coverage, no
migrations, no lint perfection required** (keep `npm run dev` compiling). Fake what needs a backend in
the UI layer (a hard-coded unit list, client-side sort of the loaded page, a mocked suggestion source)
and say in the issue what the real version needs server-side. Don't spend time on `pl.ts` unless it is free.

1. `npm ci` in your worktree first (lesson: a cezar worktree needs its own `npm ci`).
2. Start dev on **your own port** with a fresh data dir outside the repo:
   `DATA_DIR=$(mktemp -d /tmp/cpg-proposal-<letter>.XXXX) CPG_ADMIN_PASSWORD=proposal-pass PORT=<port> npm run dev`
   (run it in the background; ports: A 3211, B 3212, C 3213). Sign in as `admin` / `proposal-pass`.
3. Load realistic data: Tenants page `/admin` → the Test reset control (hidden native
   `[data-test-reset] select` → `realistic`) → Reset Test… → confirm; wait for the status Callout.
4. Capture with `agent-browser` (see `tests/integration/browser.ts` and the agent-browser lessons in
   `.ai/lessons.md`): own `--session proposal-<letter>`, `set viewport 1440 900` **after** the first
   `open`, absolute screenshot paths, viewport captures only (no full-page). Light theme, English.
   Add one capture at 390 px width or in dark theme if it shows something important.
   Native `<select>` popups do not appear in screenshots; capture open popovers/listboxes you render.
5. Save PNGs to `.ai/pipeline/runs/2026-10-24--1950UTC-table-and-entry-proposals/<letter>-artifacts/`,
   named `<letter>-<n>-<screen>.png`. Look at every PNG yourself (Read tool) before using it.
6. Commit your prototype and artifacts on your branch (local only).

## How to publish (you are authorised for exactly this, nothing else)

- Upload the PNGs to the repo's `qa-evidence` branch, folder `design-proposal-<letter>/`, with the
  Contents API exactly as `attach-image-evidence` in `.ai/trackers/github.md` does (base64 via a temp
  file + `jq --rawfile`, never on the command line). Uploads from siblings can race (HTTP 409): re-read
  the blob SHA and retry with backoff; never force-push, never delete anything there.
- Create **one** issue: `gh issue create --title "Design proposal <letter> — <theme name>: <one-line pitch>" --label enhancement --body-file <file>`.
- Do **not** push any other branch, open a PR, comment on other issues, or touch `main`.

## Issue body (keep it short; the owner wants no bullshit)

```markdown
**One of three design proposals (A, B, C) for tables and data entry. Pick one, mix, or reject.**

## TL;DR
3–5 plain sentences: what a planner gets, what it costs, what it's like to use.

## What the design system gains
| Piece | New / changed | What it does |   (components, DataTable/CrudForm props, tokens, keyboard)

## Mockups
One image per screen, each with one caption line saying what to look at.

## Cost and risk
New dependencies, server/DB work (e.g. a unit registry, sort/search in services), rough size S/M/L,
what it changes for existing screens and tests. Honest about the downsides.

## Not included
## Borrowed from
The design systems / products whose patterns this uses, one line each on what was taken.

Prototype: local branch `<your branch>` (throwaway, not for merging).
```

## Finish

Report with `cez task report --status done --result "<issue URL> …" --evidence "<pngs, issue URL>"`.
If the issue could not be created, report `partial` with the PNG paths and the body file path.
