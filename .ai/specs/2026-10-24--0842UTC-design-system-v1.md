# CPG design system v1: one neutral, tenant-aware system for every screen

**Status:** ready
**Created:** 2026-10-24 08:42 UTC
**Issue:** #203 (the discussion that decided this spec; owner answers of 2026-10-24) · **Builds on:** `implemented/2026-10-19--2048UTC-sidebar-navigation.md` (#58: shell, rail, trail), `implemented/2026-10-19--0913UTC-test-prod-tenants.md` (TEN-011: the tenant is always shown in words and colour), `implemented/2026-10-17--1321UTC-mammoth-app-icons.md` (the Fluent Flat mammoth artwork), `implemented/2026-10-19--0855UTC-user-preferences-footer-help.md` (theme, exact footer sentence, Help) · **Design authority:** this spec. It distils the two proposals attached to #203 as comments (A, "CPG design system — application guide"; B, "CPG Design System v1"); they are inputs, and where either disagrees with this spec, this spec wins. Also bound by `product-brief.md` (D04, R03, Q04) and `BACKWARD_COMPATIBILITY.md`.

## 📝 TLDR

CPG keeps shadcn/ui `radix-nova`, Tailwind 4, Geist and `@cpg/ui`, and gets one written system on top: neutral surfaces and one ink action colour; hue only for the tenant (amber Test, ink Prod with a red edge), success, warning and danger; six text sizes, a 4 px spacing grid, four radii; one `PageHeader`, one `StatusBadge`, one `Callout`, one `DataTable` contract; a state and a next step for every loading, empty, error and refused screen; plain language everywhere, with "Caveman Planning Good" kept as the name. It ships as one pull request for the whole application (decision D8), built by a lead agent and parallel workers in disjoint file scopes, and two repo tests then keep the system honest. No product behaviour, business rule, route or permission changes.

## 📝 Problem Statement

Two independent audits of `main@bfd2b20c` found the same things, re-verified at `74d9519a` in #203: 27 Tailwind palette literals in 14 files outside the token file; the shadcn neutral theme untouched (translucent dark borders, an indigo `--sidebar-primary`, a focus ring at 50 % alpha measuring below 3:1); 8 on-screen text sizes, 10 rendered radii and 4 off-grid spacing steps; 23 pages whose Suspense fallback is an empty `aria-busy` box; every lifecycle status rendered as the same grey `Badge` while master-data *Inactive* is red; six hand-built amber boxes and a component-shortage note that looks like body text; a 48 px emoji as the brand mark and an initial-letter avatar; public pages built from `zinc-*` classes and hand-made controls, Help's search without a visible label, the login without an `h1`; Next's default black 404 and no error boundary; "Cave control" as the title of an operational page. Planners meet different controls on every screen, and agents keep inventing styling per PR.

## 📝 Proposed Solution

### Principles

1. **Colour means state, never decoration.** Neutral greys plus one ink action colour; hue only for the tenant, success, warning and danger. If removing a colour loses no information, remove it.
2. **The tenant is the product's signature.** Test is amber, Prod is ink with a red edge, always with the word TEST or PROD. Those tokens are used only for the tenant.
3. **Every state carries a word and a shape.** A status is icon + label + tone; the current page is a bar + weight; an error is icon + text.
4. **One way to do each thing.** One page header, one status badge, one callout, one table. A second inline implementation is a review blocker.
5. **Tokens, not values.** Application code never names a palette colour, a pixel value or an off-scale size. A missing token is added to `globals.css`, never inlined.
6. **Density serves planners.** 14 px operational text, 32 px controls, tabular numbers, right-aligned quantities. Whitespace groups; it does not decorate.
7. **Plain words, honest claims.** Every screen uses plain, precise English and Polish. The product name "Caveman Planning Good" / "CPG", the mammoth mark and the exact footer sentence stay; the caveman voice does not (decision D2). Copy describes what is built; "MRP II" names the category the product is built toward.

### Tokens and colour

The token file is `packages/ui/src/styles/globals.css`; Appendix A is its complete new content. Semantic names only (shadcn names kept so primitives keep working), OKLCH values, light in `:root` and dark in `.dark`, every token defined for both themes.

| Token group | Light | Dark | Use |
|---|---|---|---|
| `background` / `foreground` | `oklch(1 0 0)` / `oklch(0.145 0 0)` | `oklch(0.145 0 0)` / `oklch(0.985 0 0)` | page and body text |
| `card`, `popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | panels and floating surfaces |
| `muted`, `secondary`, `accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | quiet surfaces, hover, tags |
| `muted-foreground` | `oklch(0.50 0 0)` | `oklch(0.72 0 0)` | secondary text, meta (was 0.556: 12 px meta measured 4.35:1 on the sidebar) |
| `border` | `oklch(0.90 0 0)` | `oklch(0.32 0 0)` | decorative hairlines; opaque in dark (was `oklch(1 0 0 / 10%)`) |
| `input` | `oklch(0.556 0 0)` | `oklch(0.60 0 0)` | essential control boundaries, at least 3:1 on page, card and muted (WCAG 1.4.11); distinct from `border` |
| `primary` / `primary-foreground` | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` | `oklch(0.922 0 0)` / `oklch(0.205 0 0)` | the one action colour |
| `primary-hover`, `primary-active` | `oklch(0.37 0 0)`, `oklch(0.145 0 0)` | `oklch(0.87 0 0)`, `oklch(1 0 0)` | explicit hover and pressed fills; no opacity hovers |
| `secondary-hover` | `oklch(0.94 0 0)` | `oklch(0.31 0 0)` | replaces the `color-mix()` arbitrary value |
| `ring` | `oklch(0.42 0 0)` | `oklch(0.72 0 0)` | opaque focus indicator (was 0.708 at 50 % alpha) |
| `scrim` | `oklch(0 0 0 / 0.45)` | `oklch(0 0 0 / 0.6)` | modal overlay, no blur |
| `sidebar`, `sidebar-accent`, `sidebar-primary` | `oklch(0.985 0 0)`, `oklch(0.94 0 0)`, `oklch(0.205 0 0)` | `oklch(0.205 0 0)`, `oklch(0.30 0 0)`, `oklch(0.922 0 0)` | surface, active row, indicator bar; the dark indigo goes |
| `success` text / `-surface` / `-edge` | `oklch(0.47 0.11 150)` / `oklch(0.97 0.025 150)` / `oklch(0.84 0.07 150)` | `oklch(0.80 0.12 150)` / `oklch(0.26 0.045 150)` / `oklch(0.42 0.08 150)` | done, received, in effect, import OK |
| `warning` | `oklch(0.47 0.10 60)` / `oklch(0.975 0.035 90)` / `oklch(0.82 0.12 80)` | `oklch(0.85 0.12 85)` / `oklch(0.27 0.05 70)` / `oklch(0.45 0.09 70)` | shortage, closed early, copy-once secret, read-only |
| `danger` (+ `danger-solid`) | `oklch(0.50 0.19 27)` / `oklch(0.97 0.014 20)` / `oklch(0.83 0.08 22)`; solid `oklch(0.53 0.21 27)` | `oklch(0.78 0.13 22)` / `oklch(0.27 0.06 22)` / `oklch(0.45 0.12 22)`; solid `oklch(0.54 0.20 25)` | destructive action, failure, refusal; solid only on the confirm button |
| `neutral-tone` / `neutral-surface` / `neutral-edge` | `oklch(0.37 0 0)` / `oklch(0.96 0 0)` / `oklch(0.88 0 0)` | `oklch(0.85 0 0)` / `oklch(0.27 0 0)` / `oklch(0.40 0 0)` | open, cancelled, superseded, inactive, reversed: the quiet states (named `neutral-tone` because Tailwind owns `neutral-*`) |
| `tenant-test-edge`; `tenant-test-tag` / `-tag-foreground` | `oklch(0.769 0.188 70.08)`; `oklch(0.924 0.12 95.75)` / `oklch(0.279 0.077 45.64)` | same | the 3 px top edge and switch outline; the TEST tag, pressed segment and banner |
| `tenant-prod-edge`; `tenant-prod-tag` / `-tag-foreground` | `oklch(0.577 0.245 27.33)`; `oklch(0.205 0 0)` / `oklch(0.985 0 0)` | `oklch(0.637 0.237 25.33)`; `oklch(0.922 0 0)` / `oklch(0.205 0 0)` | the PROD edge, tag and pressed segment |
| `chart-1…5` | unchanged greys | unchanged | no chart exists; a chart spec decides later |
| `radius-sm` / `-md` / `-lg` | 0.25 / 0.5 / 0.75rem | same | `xl`, `2xl`, `3xl`, `4xl` alias `lg` during migration |

There is no `info` tone (decision D4) and no brand colour token (decision D3). `--color-destructive` maps to `--danger` so shadcn's `bg-destructive` keeps resolving.

Rules:

- Components consume semantic names, never the palette. Text uses `foreground`, `muted-foreground`, `primary-foreground`, a tone colour when showing that state, or a tenant tag foreground. No opacity on text (`text-foreground/70` in the breadcrumb becomes `text-muted-foreground`). At most three neutral text colours on an admin page.
- Tone surfaces appear only on messages (`Callout`, `StatusBadge`, the tenant banner), never as page or card backgrounds.
- The tenant is shown only by tenant tokens; `warning` never means Test and `danger` never means Prod. The 3 px tenant edge on the content column (`border-t-[3px]` in `tenant-header.tsx`) is the one documented thick border.
- Body links are `foreground` with an underline. Focus is the opaque `--ring`: a global `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` in the base layer, and primitives use `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` instead of `ring-3 ring-ring/50`; sidebar items use an inset ring so the scroll container does not clip it.
- Overlays use `bg-scrim` with no backdrop blur. Shadows exist only on floating layers (`shadow-md` tooltips, popovers and menus; `shadow-lg` dialogs and sheets), never on in-page surfaces or on hover.
- The `icon.svg` fills and the `manifest.ts` literal are exceptions (see Exceptions), not failures.

**Hardcoded colours to migrate** (every palette literal outside the token file at `74d9519a`; one row per use site):

| File:line | Today | Becomes |
|---|---|---|
| `app/src/app/admin/(global)/page.tsx:20` | `border-amber-500 bg-amber-50 dark:bg-amber-950/40` (Test card) | `<TenantChoiceCard tenant="test">`: `border-tenant-test-edge`, plain `bg-card`, the TEST tag inside |
| `app/src/app/admin/(global)/page.tsx:21` | `border-red-600` (Prod card) | `<TenantChoiceCard tenant="prod">` |
| `app/src/app/admin/(global)/page.tsx:50` | `hover:shadow-md` | `hover:bg-muted` |
| `app/src/app/manifest.ts:4` | `"#ffffff"` | keep, with a comment pointing to `--background` (exception) |
| `app/src/app/page.tsx:33` | `text-zinc-600 dark:text-zinc-400` (tagline) | `text-muted-foreground` |
| `app/src/app/page.tsx:36` | hand-built CTA `rounded-lg bg-zinc-900 … text-white` | `<Button asChild size="lg"><Link …/></Button>` |
| `app/src/app/page.tsx:44,45,47,52` | `rounded-2xl border-zinc-200` cards, `text-zinc-500` index, grunt, motto | removed with the card grid and the voice change |
| `app/src/app/help/page.tsx:40,42` | hand-built `input` (`border-zinc-300`) and `button` (`bg-zinc-900 text-white`) | `<Label htmlFor="help-q">` + `<Input id="help-q">`, `<Button type="submit">` |
| `app/src/app/help/page.tsx:47,57` | `text-zinc-500` | `text-muted-foreground` |
| `app/src/app/help/page.tsx:55` | `border-zinc-200 dark:border-zinc-800` | `border-border` |
| `app/src/components/imports/import-screen.tsx:293` | `border-green-600/30 bg-green-600/10` | `<Callout tone="success" role="status">` |
| `app/src/components/tenants/tenant-switch.tsx:11` | `bg-amber-200 text-amber-950 shadow-[inset_0_0_0_1px_var(--color-amber-500)]` | `bg-tenant-test-tag text-tenant-test-tag-foreground ring-1 ring-inset ring-tenant-test-edge` |
| `app/src/components/tenants/tenant-switch.tsx:12` | `bg-neutral-900 text-neutral-50 shadow-[inset_0_-2px_0_var(--color-red-600)] dark:bg-neutral-950` | `bg-tenant-prod-tag text-tenant-prod-tag-foreground border-b-2 border-tenant-prod-edge` |
| `app/src/components/tenants/tenant-switch.tsx:16,18` | `rounded-[5px]`; `text-[9px]` in the rail | `rounded-sm`; one letter `T` / `P` at `text-xs` with `aria-label="Test"` / `"Prod"` |
| `app/src/components/tenants/tenant-header.tsx:14,15` | `border-t-amber-500`, `bg-amber-200 text-amber-950`; `border-t-red-600`, `bg-neutral-900 text-neutral-50 dark:…` | `border-t-tenant-test-edge` / `border-t-tenant-prod-edge`; `<TenantTag>` (the dark inversion lives in the token) |
| `app/src/components/tenants/read-only-banner.tsx:10,11` | `border-amber-300 bg-amber-100 text-amber-950 dark:…`; `border-red-600 bg-neutral-900 text-neutral-50` | `<TenantBanner tenant>`: tag colours + `border-tenant-*-edge` + `Lock` icon |
| `app/src/components/api-tokens/token-secret-panel.tsx:55` | `border-amber-300 bg-amber-50 text-amber-900 dark:…` | `<Callout tone="warning" title="Copy this token now">` |
| `app/src/components/goods-receipts/receipt-dialog.tsx:71` | `text-amber-700 dark:text-amber-400` lines | `<Callout tone="warning">` holding a `<ul>` |
| `app/src/components/production-orders/completion-form.tsx:150` | `border-amber-500 bg-amber-50 dark:bg-amber-950` + `role="alert"` | `<Callout tone="warning" role="alert">` (the accept checkbox stays inside) |
| `app/src/components/boms/bom-screen.tsx:115` | `border-amber-300 bg-amber-50 text-amber-950 dark:…` + `role="note"` | `<Callout tone="warning" role="note">` |
| `ui/src/components/dialog.tsx:42`, `alert-dialog.tsx:39`, `sheet.tsx:40` | `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` | `bg-scrim` |
| `ui/src/components/button.tsx:11,15` | `hover:bg-primary/80`; `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` | `hover:bg-primary-hover active:bg-primary-active`; `hover:bg-secondary-hover` |
| `ui/src/styles/globals.css` | `--sidebar-primary: oklch(0.488 0.243 264.376)` (dark), translucent dark borders, `--ring` 0.708, `outline-ring/50` | Appendix A |

### Typography and numbers

| Step | Class | px / line | Weight | Role |
|---|---|---|---|---|
| Caption | `text-xs` | 12 / 16 | 400 or 500 | meta lines, table sub-lines, tags, badges, footer, field help |
| Body (admin) | `text-sm` | 14 / 20 | 400 | admin body, table cells, buttons, labels, menus, controls |
| Body (public), title S | `text-base` | 16 / 24 | 400; 500 for titles | public copy; dialog, sheet and card titles; inputs below `md` (prevents iOS zoom) |
| Section | `text-lg` | 18 / 28 | 600 | `h2` in admin, public tagline |
| Page | `text-2xl` | 24 / 32 | 600, `tracking-tight` | the one `h1` per page, login included |
| Display | `text-4xl` | 36 / 40 | 600, `tracking-tight` | the public home `h1` only |

Weights 400, 500, 600 only (`font-bold` → `font-semibold`). Off-scale sizes go: `text-[0.8rem]` (Button `sm`) → `text-xs`; the `text-5xl` emoji → the mark sized in px; the login `text-xl` → `text-2xl` as its `h1`; the `text-[9px]` rail letters → one `text-xs` letter with an `aria-label`. One `h1` per page, rendered by `PageHeader`; `h2` for sections; no skipped levels; a `CardTitle` used as a heading renders a heading element. Prose is at most 65 characters per line (`max-w-prose`) on intros, Help topics, `Callout` bodies and empty states.

Numbers: quantities right-aligned with `tabular-nums`, the unit in a stable column or label, signed movements with their sign; IDs in Geist Mono (`font-mono`), zero-padded as stored; dates ISO; an empty value is `—` with `aria-label="none"`. The existing locale formatters and six-decimal precision stay (brief R03); this spec introduces no number format. Geist Mono is for business IDs, codes and API examples only, never for quantities, dates or decoration.

### Spacing, radius and surfaces

Spacing steps `0 1 2 3 4 6 8 12` (0, 4, 8, 12, 16, 24, 32, 48 px), plus `16` (64 px) on public pages only. `0.5` and `1.5` are allowed only inside `packages/ui/src/components` (badge padding, `xs`/`sm` buttons, menu insets). `2.5`, `3.5`, `5`, `7` and arbitrary px spacing are banned everywhere. Rhythm: page padding `px-6 pt-12 pb-12` at `md` and above, `px-4 pt-6 pb-8` below; header → content `6`; section → section `8`; within a section, field → field and card → card `4`; label → control `2`; icon → text `2`, in tags `1`. Cards keep `--card-spacing` (16 px, 12 px compact).

| Off-scale spacing found | Where (typical) | Becomes |
|---|---|---|
| `px-2.5`, `py-2.5`, `gap-2.5`, `p-2.5`, `pl-2.5` | Input, Button, sidebar, popover, home CTA | `3` for control padding-x, `2` for gaps |
| `mx-3.5` and other `3.5` | sidebar sub-menu | `3` |
| `p-5`, `px-5` | home cards, Tenants page cards | `4` |
| `pl-7` | indented sub-rows | `8` |
| `0.5`, `1.5` in `packages/app` | mixed | `1` or `2` |
| `0.5`, `1.5` in `packages/ui/src/components` | Badge, Button `xs`/`sm`, menus | keep (exception) |

These are defaults, not a search-and-replace: change the shared primitives first, then inspect consumers for duplicate overrides. A fixed-height control centres its content with flex and `min-h`, and more padding must not clip text or shrink a hit area.

Radius: `rounded-sm` 4 px (checkbox, tags, status badges, tenant switch segments), `rounded-md` 8 px (buttons, inputs, selects, menus, popovers, callouts, row focus), `rounded-lg` 12 px (cards, dialogs, sheets, panels), `rounded-full` for true circles only (radio dots, spinners). No pill badges, no pill buttons.

| Radius found | Becomes |
|---|---|
| `rounded` (4 px), `rounded-[4px]`, `rounded-[5px]`, `rounded-[2px]` (the tooltip arrow keeps its own shape) | `rounded-sm` |
| `rounded-sm` (6 px today) | `rounded-sm` (4 px after the token change) |
| `rounded-md`, `rounded-[min(var(--radius-md),10px)]`, `rounded-[min(var(--radius-md),12px)]` | `rounded-md` |
| `rounded-lg` (10 px today) on controls | `rounded-md` |
| `rounded-xl` (cards, 14 px), `rounded-t-xl`, `rounded-b-xl`, `rounded-2xl` (home, 18 px) | `rounded-lg` |
| `rounded-4xl` (Badge pill, 26 px) | `rounded-sm` |

`xl`, `2xl`, `3xl` and `4xl` alias `lg` from slice 1 so nothing breaks before each call site is cleaned up; the enforcement test then bans them.

Surfaces: a 1 px `border-border` (or Card's `ring-1 ring-foreground/10`) separates content; no card inside a card (inside a Card, group with spacing and a `border-t` divider; a `Callout` is a message, not a container, and is allowed); tables sit on the page background with row dividers, not in a Card.

### Density, targets and motion

Controls: Button `xs` 24, `sm` 28, default 32, `lg` 36 px; Input 32 px. These are today's heights; a 36 px default and a 44 px touch variant are not adopted (desk planners on laptops), and `lg` serves the public CTA and sign-in. Targets are at least 24 × 24 px or carry a documented WCAG 2.5.8 exception; icon-only buttons keep a larger transparent hit area and an accessible name; a linked table cell is at least 24 px tall. Icons are Lucide only, 16 px in controls, 14 px in tags and badges, `aria-hidden` beside text; no icon tiles beside headings. A disabled action whose reason matters explains it in accessible text, not only in a tooltip on an unfocusable button. Selection and the current page combine a non-colour cue (weight, bar, check) with the ARIA state.

Motion: about 120 ms for colour and state changes, about 180 ms for overlay appearance; hover changes background or underline only, never position, size or elevation; `prefers-reduced-motion` removes non-essential transitions, and pending text stays understandable without animation.

### Layout and the page frame

- Two page widths: wide `max-w-6xl` for lists, reports and details with tables; narrow `max-w-3xl` for Tenants, Overview, users, tokens, Help and single-form pages. `max-w-5xl` becomes wide; a detail page uses its list's width. Forms inside cap at 40rem, the sign-in card at 24rem. Dialogs keep shadcn's `max-w-sm` / `max-w-lg`.
- Gutters 16 px below 768 px, 24 px above. Sections 24 px from the header, 32 px apart.
- **`PageHeader`** on every admin page: `h1` + optional `meta` (a `StatusBadge` or tags), intro at `text-sm text-muted-foreground max-w-prose`, actions right-aligned in `flex flex-wrap gap-2` that drop under the title below `sm`, at most one solid action. Title pattern `{Concept} — {Tenant}` on tenant pages, `{Concept}` on global pages, `{Concept singular} {ID}` on details; `en.ts:686` (`{tenant} · Production orders`) joins the pattern.
- The section trail (`components/tenants/section-trail.tsx`) carries the record on detail pages (`Transactions › Production orders › 00000060`); the duplicate "Back to …" link is removed only where the trail keeps the parent list reachable at 320 px.
- Dialogs: width at most the viewport minus 32 px, height at most 90dvh with internal scrolling and reachable actions (`TALL_DIALOG` in `components/forms/form-labels.ts`); flex and grid children holding inputs or long text get `min-w-0`; Polish labels wrap and type never shrinks to fit.
- Sidebar: below 768 px the existing drawer; **768–1023 px the icon rail by default** (`collapsible="icon"` already in use), expandable as today and not persisted (sidebar spec Q8 holds); 1024 px and above expanded, collapsible. The **Transactions** group moves above Stock and Reports in `components/layout/nav-tree.ts` (decision D6).
- `DataTable`: a column `kind` (`id` 7rem mono, `text` 8rem, `longText` 12rem, `quantity` 6rem right-aligned `tabular-nums`, `date` 7rem, `status` 8rem, `actions`) sets minimum width and alignment; `priority` 1/2/3 hides 2 below `md` and 3 below `lg`; `status` is always priority 1 and the config rejects anything else; the container scrolls horizontally with the first column `sticky left-0 bg-background`, is keyboard-reachable and labelled, and the page itself never scrolls sideways; long text truncates with a `title` or wraps at words, never per character; an optional `rowTone(row)` adds a 2 px inset left edge in the tone colour plus an icon in the first cell.

### Components

Generic pieces live in `packages/ui`; domain mappings live in `packages/app` (engineering standards, package layering).

| Component | Where | Contract |
|---|---|---|
| `StatusBadge` (new) | `packages/ui/src/backend/feedback/status-badge.tsx` | `tone: "success" \| "warning" \| "danger" \| "neutral"`, `icon: LucideIcon`, `dashed?: boolean`, `children` (the label, always visible). `[icon 14px] Label`, `text-xs font-medium`, 20 px tall, `px-1.5`, `rounded-sm`, `bg-{tone}-surface text-{tone} border border-{tone}-edge` (`border-dashed` when `dashed`). The icon is `aria-hidden`. |
| Status tone map (new) | `packages/app/src/components/document-lifecycle/status-tone.ts` | Documents (customer, production and purchase orders, requisitions, transfers, shipments): `open` → neutral `CircleDot`; `completed` (Received on PO lines) → success `CircleCheck`; `closed-early` → warning `CircleMinus`; `cancelled` → neutral `CircleX`. Transfers `inTransit` → neutral `Truck`. Movements and completions `reversed` → neutral `Undo2`. Safety stock `inEffect` → success `CircleCheck`, `scheduled` → neutral `Clock`, `superseded` → neutral `History`. Master data `active` → neutral `Circle`, `inactive` → neutral dashed `CircleOff`. Tenant read-only → warning `Lock`, writable → neutral `Pencil`. Colour marks attention and completion; the resting states stay quiet (decision D4). Not statuses, so plain `Badge`: material type, "Generation 1", migration counts, role names. |
| `Badge` (restyled) | `packages/ui/src/components/badge.tsx` | A category tag, not a state: `rounded-sm`, `text-xs font-medium px-1.5 h-5`; `secondary` is `bg-muted text-foreground`, `outline` is `border-border bg-transparent`. The `default` and `destructive` variants stay for shadcn compatibility and leave domain use. |
| `Callout` (new) | `packages/ui/src/backend/feedback/callout.tsx` | `tone: "neutral" \| "success" \| "warning" \| "danger"`, `title?`, `role?` (`"note"` default, `"status"` for async results, `"alert"` only when it blocks the next step), `icon?` (defaults `Info`, `CircleCheck`, `TriangleAlert`, `OctagonAlert`), `actions?`, `children`. `rounded-md border p-4 gap-2 bg-{tone}-surface border-{tone}-edge`; icon 16 px in the tone colour; title `text-sm font-medium text-foreground`; body `text-sm text-foreground max-w-prose`. |
| `PageHeader` (new) | `packages/ui/src/backend/page-header.tsx` | `title` (string or node, rendered as the `h1`), `description?`, `actions?`, `meta?`; renders `h1 text-2xl font-semibold tracking-tight`, the description, the actions row; the block ends with `mb-6`. |
| `Button` (adjusted) | `packages/ui/src/components/button.tsx` | `default` `bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active`; `outline` `border-border bg-background hover:bg-muted`; `secondary` `bg-secondary hover:bg-secondary-hover`; `ghost` for icon and row actions; **`destructive`** restyled as `text-danger bg-danger-surface border border-danger-edge` (opens a destructive flow: "Reset Test…", "Cancel order…"; today's variant measures 3.97:1); **`destructive-solid`** new, `bg-danger-solid text-white`, for the confirm button inside an `AlertDialog` only; `link` underlined foreground. Sizes keep their heights; `sm` uses `text-xs`; `rounded-[min(var(--radius-md),…)]` becomes `rounded-md`; `px-2.5` becomes `px-3`. Labels are verb + object; a trailing `…` means a confirmation follows; a bare "Cancel" is only a dialog's dismiss button; destructive document actions sit in the `PageHeader` actions after the primary ones, never full width. |
| `DataTable` (extended) | `packages/ui/src/backend/tables/data-table.tsx` | `kind`, `priority`, `rowTone`, horizontal scroll with a sticky first column, as in Layout above. |
| `TenantTag`, `TenantBanner`, `TenantChoiceCard` (new) | `packages/app/src/components/tenants/` | Thin wrappers applying the `tenant-*` tokens so the tenant is styled in one place: the tag (`bg-tenant-test-tag text-tenant-test-tag-foreground`, Prod inverted by the token), the read-only banner (tag colours + `border-tenant-*-edge` + a `Lock` icon + the word Read-only), the `/admin` choice cards (`border-tenant-*-edge`, plain `bg-card`, the tag inside; the tenant is shown by edge and tag, not by tinting the card). `tenant-switch.tsx` and `tenant-header.tsx` consume the same tokens. |
| `MammothMark` (new) | `packages/app/src/components/layout/mammoth-mark.tsx` | An inline SVG whose paths and fills are those of `packages/app/src/app/icon.svg` (the Fluent Flat mammoth, MIT), `aria-hidden`, `size` 16 (rail), 20 (sidebar, visitor bar) or 40 (home). A unit test reads `icon.svg` and asserts the component's path data and fills match it, so the two copies cannot drift. No brand colour token (decision D3). It replaces the six emoji sites (`sidebar-nav.tsx:208,218`, `visitor-bar.tsx:23`, `app/page.tsx:30`, and the emoji inside the login title strings `en.ts:21`, `pl.ts:19`). |
| Account control | `components/layout/sidebar-nav.tsx:263` | A `CircleUserRound` icon in `text-muted-foreground` plus the name and role; the initial avatar in a filled circle goes; in the rail the icon alone keeps its accessible name. |
| Forms (`CrudForm`, unchanged behaviour) | `packages/ui/src/backend/forms/crud-form.tsx` and screens | Every control has a visible `<Label>` (an `aria-label` alone is not enough); help text `text-xs text-muted-foreground`; an error replaces the help text with a 14 px `CircleAlert` icon and `text-danger`, and the control gets `border-danger-edge`, `aria-invalid` and `aria-describedby`. Search and filter forms keep submitted and invalid values, show the active scope and offer a reset; a `<select>` whose URL value matches no option adds it as its own option. |

### States and copy

| State | Rule | Component |
|---|---|---|
| Loading | Every `<Suspense>` fallback is `LoadingMessage` or a content-shaped skeleton built from it. The 23 blank `aria-busy` divs go, the home page's `min-h-96` included. | `LoadingMessage` |
| Empty | Says what is missing and the next step: "No materials yet." → "Create material" (admin) or "Ask an administrator to add materials." (reader); "No materials match these filters." → "Clear filters"; "No help topics match '{query}'." → "Show all topics". | `EmptyState` |
| Section error | What failed and a retry: "Could not load materials. Try again." keeping the filter context. | `ErrorMessage` |
| Page-open error | Takes focus. | `ErrorSummary` |
| Pending write | "Saving material…" on the submitting action; no duplicate submission; entered values kept. | `CrudForm` |
| Validation refusal | "Enter a quantity greater than 0." beside the field plus the summary; focus moves to the summary or the first invalid field. | `CrudForm`, `ErrorSummary` |
| Write not confirmed | "The result could not be confirmed. Check the record before submitting again." | `Callout tone="warning"` |
| Version conflict | "This record changed while you were editing. Review the latest version before saving." with the draft kept. | existing refusal path |
| Read-only tenant | "Prod is read-only — business changes are blocked." Reading and the other permitted actions stay available. | `TenantBanner` |
| Sign-in refusal | "Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator." | `sign-in-form.tsx` |
| Success | "Material saved." plus the resulting record state; no duplicate success panels. | `Callout tone="success" role="status"` |
| Reversal | Confirms the exact record, consequence and reason the domain requires; never implies a generic Undo. | `ConfirmDialog` |
| Not found (new) | `app/src/app/not-found.tsx` and `app/src/app/admin/[tenant]/not-found.tsx`, inside the shell and themed: "Page not found. The address may be mistyped, or the record belongs to the other tenant." → **Go to Tenants**, or **Back to {list}** inside a tenant. | `EmptyState` |
| Unexpected error (new) | `app/src/app/error.tsx` (client): "Something went wrong on our side. Try again; if it keeps happening, tell your administrator and quote reference {digest}." → **Try again** (`reset()`); `global-error.tsx` with the same message and minimal markup. | `ErrorMessage` |
| No JavaScript | JavaScript is required on every page (decision D5). The root layout renders one `<noscript>` notice in the static shell, styled as a warning `Callout`, in both languages because the shell is language-neutral: "CPG needs JavaScript. Turn it on in your browser and reload this page." / its Polish equivalent. | `Callout` markup inside `<noscript>` |

Existing messages are audited against this table and kept where they already comply. Errors say what is wrong and what to do; refusal parameters stay structured (`params`, never interpolated). One term per concept: BOM, not recipe (brief Q04). Every new string lands in `en.ts` and `pl.ts`.

**Voice (decision D2, plain everywhere):**

| Where | Today | v1 |
|---|---|---|
| `en.ts` `home.tagline`, `layout.tsx:23` `metadata.description` | "MRP II. Because planning hard. Caveman try anyway." | "A small MRP II planning tool: it turns what customers want into plans for what to buy and what to make." (the sentence Help already uses) |
| `en.ts` `home.steps[].grunt`, `home.motto` | four caveman sentences, "Demand come. Caveman plan. Caveman make." | removed; the step names become the flow labels |
| `en.ts:21`, `pl.ts:19` login title | "🦣 Sign in to CPG" | "Sign in to CPG" (the mark is rendered beside it, not inside the string) |
| `en.ts:29` `admin.heading` (`/admin`) | "Cave control" | **"Tenants"** |
| tenant home (`admin/[tenant]/page.tsx:33` renders `admin.heading — {tenant}`) | "Cave control — Test" | **"Overview — Test"** (a separate `admin.tenantHeading` key, since the two pages no longer share a word) |
| `help/topics.ts:119-121`, `en.ts:1985`, `core/src/domain/tenants/read-only.ts:5` | "Cave control page" | "Tenants page" |
| `admin/(global)/actions.ts:22`, `api/tenants/[tenant]/route.ts:19` (comments) | "Cave control" | "Tenants" |
| the product name, the footer sentence, `manifest.ts` `name` | "Caveman Planning Good" | unchanged |

`pl.ts` mirrors every key. The empty state "active recipe" becomes "active BOM".

### Decoration and the public pages

Not part of the system: gradients, glow, glass or blur, pills or numbers above headings, highlighted heading words, KPI rows without real measures, grids of identical icon cards, floating hero cards, icon tiles, illustrations beyond the mammoth, AI sparkles, invented testimonials, ratings, metrics or company names, random per-user colours, emoji in the interface.

Public pages keep plain Tailwind on tokens and may use the `@cpg/ui` controls `Button`, `Input` and `Label` (the engineering standards' "Pages" rule gains that sentence; the navigation already comes from `@cpg/ui` on public pages).

- **Home** (`app/src/app/page.tsx`): `MammothMark` 40 px; `h1` "Caveman Planning Good" at Display; the plain tagline at `text-lg text-muted-foreground max-w-prose`; one `<Button asChild size="lg"><Link …>` (Sign in / Open CPG); then a single flow of what is built as text links to their Help topics joined by `ArrowRight` icons (Forecasts and customer orders → BOMs → Production and purchase orders → Stock), wrapping vertically below `sm`; no cards, numbers or descriptions; no screenshot in v1.
- **Help** (`app/src/app/help/page.tsx`): `<Label htmlFor="help-q">Search help</Label>`, `Input` and `Button type="submit"` at equal height, stacked below 640 px; topics at `max-w-prose`; the footer sentence keeps its exact wording and links and wraps within about 70ch.
- **Login** (`app/src/app/login/`): the card title becomes the page `h1` at `text-2xl`; the mark sits beside the title.

## 📝 Architecture

- **Where things live.** Tokens, primitives and generic `backend/` blocks in `packages/ui`; the status tone map, tenant wrappers, the mark, pages and copy in `packages/app`; nothing in `core` or `db` changes except the one message string in `core/src/domain/tenants/read-only.ts`.
- **Enforcement, two repo tests.** (1) `tests/design-tokens.test.ts` scans `packages/*/src/**/*.{ts,tsx}` (not tests, not `globals.css`) for: Tailwind palette classes `(bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|divide)-(white|black|<palette>-\d+)` and arbitrary colour values (`[#…]`, `rgb(`, `hsl(`, `oklch(`, `color-mix(`, `var(--color-<palette>-…)`); colour literals; radius classes other than `rounded-(sm|md|lg|full)` and their direction variants, and `rounded-[…]`; font-size classes other than `text-(xs|sm|base|lg|2xl|4xl)` and arbitrary `text-[<length>]`; spacing steps `2.5|3.5|5|7` and arbitrary spacing anywhere, `0.5|1.5` outside `packages/ui/src/components`; `backdrop-blur`, `bg-gradient-*`, `bg-linear-*`, `bg-radial-*`; emoji in `.tsx` and in `i18n/messages/*.ts`; `max-w-(2xl|xl|5xl)` in `packages/app/src/app/**/page.tsx`. During the run it is **report-only**: it prints the offenders per file (`process.stdout.write`, since Vitest drops a passing test's console output) and passes, so the lead can read what is left after every merge and no shared baseline file exists for parallel workers to collide on; the closing step removes the report-only switch, and the test then fails on any offender outside the allow-list. The allow-list is the Exceptions table below. (2) `packages/ui/src/styles/tokens.test.ts` parses `globals.css`, converts OKLCH to sRGB and asserts every pair in the accessibility floor for both themes.
- **Package boundaries** stay as ESLint enforces them; `StatusBadge`, `Callout` and `PageHeader` know no domain. Optional, once `StatusBadge` exists: `no-restricted-imports` for `@cpg/ui/components/badge` under `app/src/components/**` so states cannot drift back to the generic Badge.
- **Compatibility.** No surface protected by `BACKWARD_COMPATIBILITY.md` changes: page URLs, help topic ids, API paths, envelopes, error codes and statuses stay. Help topic titles, i18n strings and the `TENANT_READ_ONLY` message text change (the text is not a protected field; the code is), in one PR with both translations, so API clients that display the message see new wording.

## 📝 UI/UX

**Screen archetypes**, the compositions every screen of its kind follows:

| Screen | Composition |
|---|---|
| Master-data list | tenant header → `PageHeader` (title, allowed create action) → labelled filters → `DataTable` → pagination or empty state |
| Document detail | tenant header → `PageHeader` (ID, `StatusBadge` as `meta`, allowed actions) → compact summary → lines and quantities → history and related documents |
| Form or dialog | action-specific title → visible labels and help text → validation → primary action and Cancel |
| Import | numbered steps tied to actual completion: template → dry run → commit, one authoritative result per stage |
| Report | title → labelled scope and date filters → table → links to source records; units and scope stay visible |
| Help | title → labelled search → topic navigation → readable instructions → recovery links |
| Public home | mark → product explanation → Sign in / Open CPG → the flow of built capabilities |

**Accessibility floor**, each line met by the tokens and components above: text contrast ≥ 4.5:1 (large ≥ 3:1) and non-text ≥ 3:1, computed by the token test; focus always visible; colour never the only signal; targets ≥ 24 px; a visible label on every control; one `h1` per page; line length ≤ 75 characters (target 65ch); no sideways page scroll at 320 px; every state in both themes; the no-JavaScript case explained.

## 📝 Edge Cases & Failure Scenarios

- **A migrated control clips or shrinks.** Moving `px-2.5` to `px-3` or `h-7` text to `text-xs` can clip Polish labels or shrink a hit area; check the rendered control, keep `min-h`, and let the content wrap rather than reducing type.
- **Two statuses look alike after the tone change.** Open and Cancelled are both neutral; the icon (`CircleDot` vs `CircleX`) and the label separate them, and a mixed list must be checked in a real browser in both themes.
- **Radius aliases hide unmigrated call sites.** `rounded-xl|2xl|4xl` render as `lg` from the first unit; the report-only scan is what finds the leftovers, so the lead reads it after every merge and the close flips it to failing.
- **`notFound()` under Partial Prefetching answers 200** (lesson 2026-10-19): the not-found integration test asserts the UI and `noindex`, not the status.
- **The error boundary has no deterministic trigger in the production image**, so `error.tsx` and `global-error.tsx` are covered by unit tests (a thrown error renders the message with its digest; Try again calls `reset()`), and AGENTS.md's one-integration-test-per-page rule is met by the not-found pages only. Flagged here as a deviation for the owner.
- **The `<noscript>` notice sits in the static shell**, which knows no locale, hence both languages in one notice; a unit test on `layout.tsx` asserts both.
- **`TENANT_READ_ONLY`'s message is matched by exact text** in the screens (lesson 2026-10-23): change `core/src/domain/tenants/read-only.ts`, `en.ts` and `pl.ts` in the same PR and run `read-only.test.ts`.
- **The rail at 768–1023 px must keep the tenant visible** (TEN-011): the tenant header row carries it when the switch is collapsed to letters.
- **Parallel workers must never share a file.** The original slices overlap at file level (the status badge and the shortage callout both edit `production-screen.tsx`; the page frame and the state pages both edit every `page.tsx`; the copy change edits tests that other units own), so the delivery plan cuts the parallel units by file ownership, not by slice, and runs the copy change before the parallel units because it touches `en.ts`, `pl.ts` and tests across the tree. A worker that needs a change outside its scope reports it instead of making it.

## 📝 Risks & Impact Review

- Cross-cutting by nature (every screen, the shared primitives, the token file), hence `risk-high` on #203. The owner chose one PR over eleven (D8), so the mitigation moves inside the run: the foundation units land one after another and are gated before anything builds on them; the parallel units own disjoint files and are merged one at a time with the gate re-run after each merge; the full integration suite and a browser QA of the acceptance screens run before the PR opens; and the owner reviews one large PR with screenshots rather than eleven small ones.
- Density is the main untested assumption: 14 px text and 32 px controls are today's values, so no screen gets denser, but the acceptance run checks a populated Materials list, an order with long names and quantities, an import refusal and a tall dialog in both languages on the realistic dataset.
- The copy slice changes strings 7 unit-test files and 4 integration files assert; the slice updates them, and `messages.test.ts` keeps EN/PL key parity.
- The sidebar changes deviate from a spec the owner chose; the owner approved them in #203 (D6), and they are reversible in one file each.
- Visual regressions are not caught by unit tests; each UI slice is QA'd in a browser at 320, 768 and 1440 px in light and dark before merge (the pipeline's QA step).

## 📝 Decisions

Owner decisions, taken in #203 on 2026-10-24 (answers to the issue's Q1–Q7):

| # | Decision | Outcome | Consequence here |
|---|---|---|---|
| D1 | Base document | Proposal B is the base; A is grafted where B is silent. | This spec's structure follows B; A supplies states and copy, archetypes, input contrast, targets, motion, dialog and reflow rules, exceptions, ownership. |
| D2 | Voice | Plain everywhere; "this is a real system, with a funny name". The product name, the mark and the footer sentence stay. | Principle 7; the Voice table; slice 8. |
| D3 | Brand mark | The Fluent Flat mammoth with its own fills; no brand colour token. | `MammothMark`; no `--brand`; the artwork fills are an exception. |
| D4 | Status colour | Four tones; no `info` blue; Open is neutral. | Tokens; the status tone map; `Callout` tones. |
| D5 | JavaScript | Required on every page; a `<noscript>` notice explains it. | States table; slice 10. |
| D6 | Navigation defaults | Icon rail by default at 768–1023 px; Transactions above Stock and Reports. | Layout; slice 7. |
| D7 | Scope | One spec with all eleven slices as phases. | Phasing below. |
| D8 | Delivery | One pull request for the whole application, built in one go by a lead agent (Fable 5.1) that coordinates and workers (Opus 5.5) that implement, the sequential units first and then the parallel ones. Decided 2026-10-24, replacing the one-PR-per-slice rollout. | Phasing: the work units, their file ownership and the order; the report-only scan during the run. |

Delegated decisions ("for the rest, proceed with your recommendations"): everything else in Proposed Solution, notably `tenant-*` naming, the distinct `--input`, explicit hover and active tokens, today's control heights, the two page widths, `Badge` kept as the category tag under its own name, no number-format change, no home-page screenshot, the ratchet form of the enforcement test, and the one-sentence standards amendment for public pages.

## Exceptions

| Exception | Where | Why | Verified by |
|---|---|---|---|
| The mammoth artwork's fills (`#6D4534`, `#A56953`, `#FFDEA7`, `#1C1C1C`) | `app/src/app/icon.svg`, `components/layout/mammoth-mark.tsx` | Artwork, not interface colour; MIT-licensed Fluent Flat asset | the mark's sync test; the token scan allow-lists both files |
| `ICON_BACKGROUND = "#ffffff"` | `app/src/app/manifest.ts` | A Web App Manifest cannot read CSS variables; a comment points to `--background` | allow-listed |
| `bg-[Canvas] text-[CanvasText]` | `ui/src/components/native-select.tsx` | System colour keywords for forced-colours mode | allow-listed |
| `border-t-[3px]` tenant edge | `components/tenants/tenant-header.tsx` | TEN-011's established context edge | allow-listed |
| `0.5` and `1.5` spacing | `packages/ui/src/components/**` only | Optical insets of compact controls | the scan's path rule |
| `--card-spacing` alias and `gap-(--card-spacing)` | `ui/src/components/card.tsx` | The Card contract, 16 / 12 px | not a literal; passes the scan |
| `16` (64 px) spacing | `app/src/app/page.tsx`, `help/`, `login/` | Public-page rhythm | the scan's path rule |

Any new exception records a user reason, its scope and a verification example in this table before it is allow-listed.

## 📋 Phasing

**Delivery (decision D8): one pull request for the whole application.** A lead agent coordinates, integrates and closes; workers implement. Three units run one after another because everything else depends on them; four run in parallel in disjoint file scopes; the lead closes. The eleven slices of the original plan stay as the inventory of what changes, and the table maps them to units. The "Owns" column is the whole of what a unit may edit; everything a unit needs outside it is either already merged (the sequential units) or reported to the lead.

| Unit | Order | Slices | Owns | Delivers |
|---|---|---|---|---|
| **W1** Tokens and focus | sequential, first | 1 | `packages/ui/src/styles/**`, `packages/ui/src/components/**`, `tests/design-tokens.test.ts` (new) | Appendix A as `globals.css`; the focus ring and overlay changes in every primitive; `button.tsx` hovers on the new tokens; `tokens.test.ts`; the scan test in report-only mode |
| **W2** Shared components | sequential, second | 2, plus the shared parts of 4, 5 and 7 | `packages/ui/src/backend/**`, `packages/ui/src/components/badge.tsx`, `packages/ui/src/components/button.tsx`, `packages/app/src/components/layout/mammoth-mark.tsx` (new, with its test), `packages/app/src/components/document-lifecycle/status-tone.ts` (new, with its test) | `StatusBadge`, `Callout`, `PageHeader`; the `Badge` restyle; `Button` `destructive` / `destructive-solid`, `sm` text, radius and padding; `DataTable` `kind` / `priority` / `rowTone` / horizontal scroll / sticky first column; `MammothMark` with its `icon.svg` sync test; the status tone map |
| **W3** Copy and public pages | sequential, third | 8, plus the public pages of 9 | `packages/app/src/i18n/messages/**`, `packages/app/src/help/**`, `packages/core/src/domain/tenants/read-only.ts`, `packages/core/src/http/tenant-server-action.test.ts`, `packages/app/src/app/page.tsx` and `page.test.tsx`, `packages/app/src/app/help/**`, `packages/app/src/app/login/**`, `packages/app/src/app/layout.tsx` (the metadata only), `packages/app/src/app/admin/(global)/actions.ts` and its test, `packages/app/src/app/api/tenants/[tenant]/route.ts` (the comment), the "Cave control" assertions in `packages/app/src/app/admin/**/*.test.tsx`; integration `preferences`, `read-only`, `smoke`, `test-reset`, `help`, `auth`, `footer` | the Voice table in both languages; the home rebuild; Help's label and `@cpg/ui` controls; the login `h1` with the mark beside it; `metadata.description`; "active recipe" → "active BOM" |
| **P1** Admin page frame and states | parallel | 6 (pages), 10 | `packages/app/src/app/admin/**` except `(global)/page.tsx` and its test; `packages/app/src/app/layout.tsx` (the `<noscript>` notice and the sidebar fallback); `packages/app/src/app/not-found.tsx`, `admin/[tenant]/not-found.tsx`, `error.tsx`, `global-error.tsx` (all new); `tests/integration/not-found.test.ts` (new) | `PageHeader` on every admin page; the two widths; every Suspense fallback → `LoadingMessage`; the not-found and error pages; the notice |
| **P2** Document screens | parallel | 4, 5, 6 (components) and 7 (apply) for documents | `packages/app/src/components/{customer-orders,shipments,goods-issues,forecasts,production-orders,purchase-orders,purchase-requisitions,purchasing,goods-receipts,transfers,document-lifecycle}/**` except `status-tone.ts`; integration `production-orders`, `production-completions`, `production-transfer-reversals`, `goods-receipts`, `purchasing`, `customer-orders`, `shipments`, `transfers`, `forecasts`, `document-lifecycle` | `StatusBadge` in every document status cell; `Callout` in `completion-form` and `receipt-dialog`; the shortage callout and `rowTone` on the production order; `kind` / `priority` on every document table; "Back to …" links removed where the trail keeps the list reachable; "Cancel order…" and its siblings into the header via `lifecycle-control.tsx` |
| **P3** Master data, stock, reports, admin tools | parallel | 4, 5, 6 (components) and 7 (apply) for the rest | `packages/app/src/components/{materials,named-records,master-data,boms,planning-parameters,safety-stock,stock,reports,imports,api-tokens,audit,users,preferences,forms}/**`; integration `materials`, `named-records`, `boms`, `planning-parameters`, `import`, `stock-import`, `stock`, `stock-reversals`, `stock-report`, `variance-report`, `audit`, `audit-history`, `users`, `api-tokens` | `StatusBadge` for materials, named records, BOMs, users, safety stock and the audit table; `Callout` in `bom-screen`, `token-secret-panel`, `import-screen`; `kind` / `priority` on every table here; "Back to …" links removed |
| **P4** Tenants and navigation shell | parallel | 3, 7 (sidebar), 9 (shell) | `packages/app/src/components/tenants/**`, `packages/app/src/components/layout/**`, `packages/app/src/app/admin/(global)/page.tsx` and its test; integration `tenants`, `navigation` | `TenantTag`, `TenantBanner`, `TenantChoiceCard`; `tenant-switch`, `tenant-header`, `read-only-banner` on the tokens; the record in the section trail; the rail by default below `lg`; Transactions above Stock and Reports; `MammothMark` in the sidebar and the visitor bar; the account icon; `PageHeader`, the fallback and the choice cards on `/admin` |
| **Close** (the lead) | last | 11 | `tests/design-tokens.test.ts` (the flip), `.ai/docs/engineering-standards.md`, the ESLint config (optional), this spec (the move to `implemented/`), `.ai/pipeline/runs/**` | the scan fails on any offender; the checklist line; the full gate and the full integration suite; browser QA evidence; the PR |

Rules for every unit: read `.ai/lessons.md` and this spec first; `npm ci` in a fresh worktree; tests next to the code at 100 % coverage of the unit's own changes; the gate (`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`) green on the unit's own diff, judged by exit codes; the unit's integration files run with `npm run test:integration -- tests/integration/<file>.test.ts`; nothing edited outside "Owns"; no PR opened by a worker. The lead merges one unit at a time with `git merge --no-ff`, re-runs the gate after each merge, reads the scan's report, and re-dispatches a unit that came back partial.

## 📋 Implementation Plan

### W1 — Tokens and focus (`packages/ui`)

1. Replace `packages/ui/src/styles/globals.css` with Appendix A.
2. In every `packages/ui/src/components/*.tsx`, replace `focus-visible:ring-3 focus-visible:ring-ring/50` (and `ring-[3px]`) with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`; in `sidebar.tsx` menu buttons add `ring-inset`.
3. `dialog.tsx:42`, `alert-dialog.tsx:39`, `sheet.tsx:40`: `bg-black/10 … supports-backdrop-filter:backdrop-blur-xs` → `bg-scrim`.
4. `button.tsx`: `default` to `hover:bg-primary-hover active:bg-primary-active`; `secondary` to `hover:bg-secondary-hover`.
5. Write `packages/ui/src/styles/tokens.test.ts`: parse the `:root` and `.dark` blocks, convert OKLCH to sRGB, compute WCAG ratios, assert: `foreground` on `background`, `card`, `muted` ≥ 4.5; `muted-foreground` on `background`, `muted`, `sidebar` ≥ 4.5; `primary-foreground` on `primary` ≥ 4.5; each tone text on its surface ≥ 4.5; `danger-solid` with white ≥ 4.5; tenant tag foregrounds on their tags ≥ 4.5; `ring` on `background`, `sidebar`, `muted` ≥ 3; `input` on `background`, `card`, `muted` ≥ 3; `tenant-prod-edge` on `background` ≥ 3; both themes.
6. Write `tests/design-tokens.test.ts` with the scan rules from Architecture and the allow-list from Exceptions, in report-only mode: one exported constant switches between "print offenders and pass" and "fail on any offender"; a unit test of the scanner itself asserts both modes on fixture strings.
7. Gate; run `smoke.test.ts` and `navigation.test.ts`.

### W2 — Shared components

1. `packages/ui/src/backend/feedback/status-badge.tsx`, `callout.tsx`, and `packages/ui/src/backend/page-header.tsx` with the contracts in Components; export them from the package like the existing `backend/` blocks.
2. `badge.tsx`: `rounded-4xl` → `rounded-sm`, `px-2` → `px-1.5`, `secondary` as `bg-muted text-foreground`, keep `outline`, `default` and `destructive`.
3. `button.tsx`: restyle `destructive`, add `destructive-solid`, `sm` to `text-xs`, every `rounded-[min(var(--radius-md),…)]` to `rounded-md`, `px-2.5` to `px-3`.
4. `data-table.tsx`: `kind` and `priority` on `DataTableColumn`, minimum widths, alignment, responsive classes, the validation that `status` is priority 1, `rowTone`, the scrolling container with a sticky first column and an accessible label; existing callers keep working without the new fields.
5. `packages/app/src/components/layout/mammoth-mark.tsx`: the inline SVG from `icon.svg`, `size` prop, `aria-hidden`; a test that reads `icon.svg` and compares path data and fills.
6. `packages/app/src/components/document-lifecycle/status-tone.ts` with the map from Components, typed over the existing status unions, and a unit test over every state.
7. Unit tests to 100 % for every new and changed component; gate.

### W3 — Copy and public pages

1. Apply the Voice table in `en.ts` and `pl.ts` (new `admin.tenantHeading`), `layout.tsx` metadata, `help/topics.ts`, `core/src/domain/tenants/read-only.ts`, the two comments; "active recipe" → "active BOM"; `en.ts:686` and its `pl.ts` twin to `Production orders — {tenant}`.
2. Rebuild `app/src/app/page.tsx` per Decoration (`MammothMark` 40 px, Display `h1`, plain tagline, `Button asChild size="lg"`, the flow of built capabilities as text links); Help gets `Label`, `Input`, `Button`; the login card title becomes the `h1` with the mark beside it.
3. Update the seven unit-test files that assert "Cave control", `page.test.tsx`, `login/page.test.tsx`, `help/page.test.tsx` and `messages.test.ts`; gate; run `preferences`, `read-only`, `smoke`, `test-reset`, `help`, `auth`, `footer`.

### P1 — Admin page frame and states

1. Adopt `PageHeader` on every page under `app/src/app/admin/**` except `(global)/page.tsx`; map `max-w-5xl` to `max-w-6xl` and the narrow pages to `max-w-3xl`; every blank Suspense fallback to `LoadingMessage`.
2. `not-found.tsx` (root, tenant), `error.tsx`, `global-error.tsx` per the States table; the `<noscript>` notice in `layout.tsx` in both languages.
3. Unit tests (the layout asserts the notice in both languages; the error pages assert message, digest and `reset()`); `tests/integration/not-found.test.ts` (an unknown URL and an unknown record id, asserting the message, the way back and `noindex`); gate.

### P2 — Document screens

1. Replace each status `Badge` in the document screens and tables with `<StatusBadge>` fed by the tone map; labels and translations unchanged.
2. `completion-form.tsx:150` and `receipt-dialog.tsx:71` to `Callout`, keeping each box's `role` and children; the shortage `Callout tone="warning" title="{n} components short"` ("You can still create this plan; stock is checked when a completion is posted.") above the components table, `rowTone="warning"` on shortage rows with the `TriangleAlert` beside the shortage value, zero-shortage rows plain.
3. `kind` and `priority` on every table in scope; remove each "Back to …" link only after checking the section trail at 320 px keeps the list link; move the lifecycle "Cancel" into the header as "Cancel order…" (and transfer, shipment) via `lifecycle-control.tsx`.
4. Screen unit tests assert the badge's label and tone and the callouts; gate; run the integration files in scope.

### P3 — Master data, stock, reports, admin tools

1. `StatusBadge` for materials, named records, BOMs, users, safety stock and the audit table (including the `destructive` Inactive badges), fed by the tone map.
2. `bom-screen.tsx:115`, `token-secret-panel.tsx:55` and `import-screen.tsx:293` to `Callout`, keeping `role` and children.
3. `kind` and `priority` on every table in scope; "Back to …" links removed where the trail keeps the list reachable.
4. Unit tests; gate; run the integration files in scope.

### P4 — Tenants and navigation shell

1. `tenant-tag.tsx`, `tenant-choice-card.tsx` (new) and `read-only-banner.tsx` restyled as `TenantBanner` behaviour (tag colours, `Lock`, "Read-only"), all on `tenant-*` tokens; `tenant-switch.tsx` and `tenant-header.tsx` per the colour migration table; the `GLOBAL` tag stays `bg-muted text-muted-foreground`; the section trail shows the record on detail pages.
2. `sidebar-nav.tsx`: rail by default between `md` and `lg`, `MammothMark` at `:208` and `:218`, the `CircleUserRound` account icon at `:263`; `visitor-bar.tsx:23` to `MammothMark`; `nav-tree.ts`: Transactions above Stock and Reports.
3. `admin/(global)/page.tsx`: `TenantChoiceCard`, no hover shadow, `PageHeader`, `LoadingMessage` fallback.
4. Update the three tenant tests, `sidebar-nav.test.tsx`, `visitor-bar.test.tsx`, `account-panel.test.tsx`, `nav-tree.test.ts` and `admin/(global)/page.test.tsx`; gate; run `tenants` and `navigation`.

### Close — the lead

1. Flip `tests/design-tokens.test.ts` to failing; it must pass on the merged tree, with every remaining literal either migrated or in the Exceptions table.
2. Add the review-checklist line to `.ai/docs/engineering-standards.md` ("Uses tokens and components from the design system; no new palette classes, radius, size or spacing values; states use `StatusBadge` or `Callout`; copy is plain") and the one sentence under "Pages" allowing `@cpg/ui` controls on public pages; optionally the `no-restricted-imports` rule.
3. Run the full gate and the full integration suite once (`npm run test:integration`, about seven minutes on one machine; without Docker, the standalone-server method in `.ai/lessons.md`).
4. QA the acceptance screens in a real browser at 320, 768 and 1440 px in light and dark, in both languages, on the realistic dataset; attach the screenshots to the PR as evidence.
5. Move this spec to `.ai/specs/implemented/` with `Status: implemented` and implementation notes; finish the run folder in `.ai/pipeline/runs/`; open the PR against `main` with the acceptance criteria ticked, the evidence linked, `Closes #203` and `Refs #204`, and the labels `feature`, `priority-medium`, `risk-high`, `needs-qa`, `review` through the label guards.

## Acceptance criteria

- Given each representative screen (Tenants, Overview, Materials list and detail, a production order with a shortage, the import, the stock report, Help, home, login) at 320, 768 and 1440 px in light and dark, every essential action is reachable and the page has no horizontal overflow; any table overflow is local, labelled and keyboard-operable.
- Given the token file, `tokens.test.ts` passes every pair in the accessibility floor for both themes, and the rendered focus, hover, disabled and invalid states meet the same thresholds in a browser.
- Given keyboard-only use, focus is visible on every interactive element, logical, unobscured, and returned to the opener after a dialog, sheet or menu closes.
- Given empty, filtered-empty, loading, successful and refused operations, the screen shows the state and a valid next step from the States table without discarding entered values.
- Given JavaScript disabled, every page shows the `<noscript>` notice in both languages.
- Given English or Polish and 200 % browser zoom, labels and actions wrap without clipping or shrinking.
- Given a business quantity or identifier, its precision, unit and alignment are preserved; IDs are monospaced.
- Given a mixed list of Open, Completed, Closed Early and Cancelled documents, each status is distinguishable with colour removed (icon and label) in both themes.
- Given the repository, `tests/design-tokens.test.ts` fails on a palette class, an off-scale radius, size or spacing, a blur or gradient, an emoji, or a brand-coloured utility anywhere outside the Exceptions table, and passes on `main`.
- Given a populated Materials list, an order with long names and quantities, an import refusal and a tall editing dialog on the realistic dataset, the owner judges scanability and touch accuracy acceptable in both languages; if not, row spacing or column priorities are adjusted before the `lg` control variant is widened.

## Appendix A: `packages/ui/src/styles/globals.css`

The complete token file for slice 1. The shadcn names are kept so the primitives keep working; the tone and tenant tokens are additive. Proposal B's author dropped an earlier form of this block (with `info` and `brand` tokens, `env-*` names and `--input` equal to `--border`) into a scratch copy of `main@bfd2b20c` and `next build` passed; this form has not been built yet, which slice 1 does first.

```css
/*
 * Tailwind entry point + CPG design tokens (design system v1). Imported once by the app's globals.css.
 * Colour means state: neutrals + one ink action colour; hue only for the tenant, success, warning and danger.
 */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
@source "../**/*.{ts,tsx}";

@theme inline {
    --font-sans: var(--font-geist-sans);
    --font-heading: var(--font-sans);
    --font-mono: var(--font-geist-mono);

    /* Neutrals and action (shadcn names kept) */
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary-hover: var(--primary-hover);
    --color-primary-active: var(--primary-active);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary-hover: var(--secondary-hover);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--danger);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);
    --color-scrim: var(--scrim);
    --color-sidebar: var(--sidebar);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-ring: var(--sidebar-ring);
    --color-chart-1: var(--chart-1);
    --color-chart-2: var(--chart-2);
    --color-chart-3: var(--chart-3);
    --color-chart-4: var(--chart-4);
    --color-chart-5: var(--chart-5);

    /* Tones: text-{tone}, bg-{tone}-surface, border-{tone}-edge. The neutral text tone is
       `neutral-tone` because Tailwind owns the `neutral-*` palette names. */
    --color-success: var(--success);
    --color-success-surface: var(--success-surface);
    --color-success-edge: var(--success-edge);
    --color-warning: var(--warning);
    --color-warning-surface: var(--warning-surface);
    --color-warning-edge: var(--warning-edge);
    --color-danger: var(--danger);
    --color-danger-surface: var(--danger-surface);
    --color-danger-edge: var(--danger-edge);
    --color-danger-solid: var(--danger-solid);
    --color-neutral-tone: var(--neutral-tone);
    --color-neutral-surface: var(--neutral-surface);
    --color-neutral-edge: var(--neutral-edge);

    /* Tenant: the only place these hues mean something (TEN-011) */
    --color-tenant-test-edge: var(--tenant-test-edge);
    --color-tenant-test-tag: var(--tenant-test-tag);
    --color-tenant-test-tag-foreground: var(--tenant-test-tag-foreground);
    --color-tenant-prod-edge: var(--tenant-prod-edge);
    --color-tenant-prod-tag: var(--tenant-prod-tag);
    --color-tenant-prod-tag-foreground: var(--tenant-prod-tag-foreground);

    /* Radius: four values. xl/2xl/3xl/4xl alias lg during migration; banned by tests/design-tokens.test.ts afterwards. */
    --radius-sm: 0.25rem;
    --radius-md: 0.5rem;
    --radius-lg: 0.75rem;
    --radius-xl: 0.75rem;
    --radius-2xl: 0.75rem;
    --radius-3xl: 0.75rem;
    --radius-4xl: 0.75rem;
}

:root {
    --radius: 0.5rem;

    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --primary-hover: oklch(0.37 0 0);
    --primary-active: oklch(0.145 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --secondary-hover: oklch(0.94 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.50 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --border: oklch(0.90 0 0);
    --input: oklch(0.556 0 0);
    --ring: oklch(0.42 0 0);
    --scrim: oklch(0 0 0 / 0.45);

    --success: oklch(0.47 0.11 150);
    --success-surface: oklch(0.97 0.025 150);
    --success-edge: oklch(0.84 0.07 150);
    --warning: oklch(0.47 0.10 60);
    --warning-surface: oklch(0.975 0.035 90);
    --warning-edge: oklch(0.82 0.12 80);
    --danger: oklch(0.50 0.19 27);
    --danger-surface: oklch(0.97 0.014 20);
    --danger-edge: oklch(0.83 0.08 22);
    --danger-solid: oklch(0.53 0.21 27);
    --neutral-tone: oklch(0.37 0 0);
    --neutral-surface: oklch(0.96 0 0);
    --neutral-edge: oklch(0.88 0 0);

    --tenant-test-edge: oklch(0.769 0.188 70.08);
    --tenant-test-tag: oklch(0.924 0.12 95.75);
    --tenant-test-tag-foreground: oklch(0.279 0.077 45.64);
    --tenant-prod-edge: oklch(0.577 0.245 27.33);
    --tenant-prod-tag: oklch(0.205 0 0);
    --tenant-prod-tag-foreground: oklch(0.985 0 0);

    --chart-1: oklch(0.87 0 0);
    --chart-2: oklch(0.556 0 0);
    --chart-3: oklch(0.439 0 0);
    --chart-4: oklch(0.371 0 0);
    --chart-5: oklch(0.269 0 0);

    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.94 0 0);
    --sidebar-accent-foreground: oklch(0.145 0 0);
    --sidebar-border: oklch(0.90 0 0);
    --sidebar-ring: oklch(0.42 0 0);
}

.dark {
    color-scheme: dark;
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --primary-hover: oklch(0.87 0 0);
    --primary-active: oklch(1 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --secondary-hover: oklch(0.31 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.72 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --border: oklch(0.32 0 0);
    --input: oklch(0.60 0 0);
    --ring: oklch(0.72 0 0);
    --scrim: oklch(0 0 0 / 0.6);

    --success: oklch(0.80 0.12 150);
    --success-surface: oklch(0.26 0.045 150);
    --success-edge: oklch(0.42 0.08 150);
    --warning: oklch(0.85 0.12 85);
    --warning-surface: oklch(0.27 0.05 70);
    --warning-edge: oklch(0.45 0.09 70);
    --danger: oklch(0.78 0.13 22);
    --danger-surface: oklch(0.27 0.06 22);
    --danger-edge: oklch(0.45 0.12 22);
    --danger-solid: oklch(0.54 0.20 25);
    --neutral-tone: oklch(0.85 0 0);
    --neutral-surface: oklch(0.27 0 0);
    --neutral-edge: oklch(0.40 0 0);

    --tenant-test-edge: oklch(0.769 0.188 70.08);
    --tenant-test-tag: oklch(0.924 0.12 95.75);
    --tenant-test-tag-foreground: oklch(0.279 0.077 45.64);
    --tenant-prod-edge: oklch(0.637 0.237 25.33);
    --tenant-prod-tag: oklch(0.922 0 0);
    --tenant-prod-tag-foreground: oklch(0.205 0 0);

    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.922 0 0);
    --sidebar-primary-foreground: oklch(0.205 0 0);
    --sidebar-accent: oklch(0.30 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(0.32 0 0);
    --sidebar-ring: oklch(0.72 0 0);
}

@layer base {
    * {
        @apply border-border outline-ring;
    }
    body {
        @apply bg-background text-foreground;
    }
    :focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }
}
```

Notes: `--destructive` is no longer defined; `--color-destructive` maps to `--danger`, so shadcn's `bg-destructive` / `text-destructive` resolve to the danger colour without editing every primitive. In Tailwind 4, setting `--radius-*` directly in `@theme inline` overrides the multiplier-based values shadcn generated. `--chart-*` are unchanged and identical in both themes, so `.dark` does not repeat them.
