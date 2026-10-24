# W1 — Tokens and focus (design system v1, unit 1 of 8)

You are one worker in a lead-and-workers run that implements the CPG design system v1 spec as ONE pull request. The lead (another agent) briefs, validates, merges and closes. You implement exactly this unit, in your own git worktree and branch, and report back. Read this whole brief before touching anything.

## Source of truth

`.ai/specs/2026-10-24--0842UTC-design-system-v1.md` in your worktree. Where this brief and the spec disagree, the spec wins; tell the lead in your report.

Read first, in this order: `.ai/lessons.md` (all of it), `.ai/docs/engineering-standards.md`, then the spec's sections "Tokens and colour", "Typography and numbers", "Spacing, radius and surfaces", "Density, targets and motion", "Architecture", "Exceptions", "Implementation Plan → W1 — Tokens and focus", "Edge Cases & Failure Scenarios → Radius aliases hide unmigrated call sites", and "Appendix A". Then run `npm ci` in your worktree (lesson 2026-10-19: a cezar worktree needs its own `npm ci`, or Node resolves `@cpg/*` to another checkout).

## Your row of the spec's Phasing table (verbatim; "Owns" is the whole of what you may edit)

| Unit | Order | Slices | Owns | Delivers |
|---|---|---|---|---|
| **W1** Tokens and focus | sequential, first | 1 | `packages/ui/src/styles/**`, `packages/ui/src/components/**`, `tests/design-tokens.test.ts` (new) | Appendix A as `globals.css`; the focus ring and overlay changes in every primitive; `button.tsx` hovers on the new tokens; `tokens.test.ts`; the scan test in report-only mode |

Lead's refinement of "Owns" (the lead's decision, recorded in the run folder): inside `packages/ui/src/components/**`, `badge.tsx` and `button.tsx` belong to the next unit (W2), which restyles them. In `button.tsx` you change only (a) the focus-ring classes of step 2 and (b) the hover/active tokens of step 4; in `badge.tsx` only the focus-ring classes of step 2, if it has any. Every other primitive in `packages/ui/src/components/*.tsx` is yours in full: besides the focus and overlay changes, migrate its off-scale radius, spacing and font-size classes per the spec's migration tables (see "Scope detail" below), because no other unit owns those files.

## Spec sections you implement (by heading)

- **Tokens and colour**: the token table and its Rules; from "Hardcoded colours to migrate", the rows for `ui/src/components/dialog.tsx:42`, `alert-dialog.tsx:39`, `sheet.tsx:40` (→ `bg-scrim`), `ui/src/components/button.tsx:11,15` (→ `hover:bg-primary-hover active:bg-primary-active`; `hover:bg-secondary-hover`), and `ui/src/styles/globals.css` (→ Appendix A).
- **Spacing, radius and surfaces**: the radius table and the alias paragraph ("`xl`, `2xl`, `3xl` and `4xl` alias `lg` from slice 1"); the off-scale spacing table's rows that fall in `packages/ui/src/components` (Input, sidebar, popover; `0.5`/`1.5` stay there).
- **Typography and numbers**: only as far as `packages/ui/src/components` is concerned (no off-scale sizes in the primitives you own; `text-[0.8rem]` in Button `sm` is W2's).
- **Architecture → Enforcement, two repo tests**: both tests, (1) `tests/design-tokens.test.ts` in report-only mode, (2) `packages/ui/src/styles/tokens.test.ts`.
- **Exceptions**: the allow-list of the scan, verbatim from the table.
- **Appendix A**: the complete new content of `packages/ui/src/styles/globals.css`. Copy it exactly; do not "improve" a value.

## Implementation Plan steps for W1 (from the spec, verbatim)

1. Replace `packages/ui/src/styles/globals.css` with Appendix A.
2. In every `packages/ui/src/components/*.tsx`, replace `focus-visible:ring-3 focus-visible:ring-ring/50` (and `ring-[3px]`) with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`; in `sidebar.tsx` menu buttons add `ring-inset`.
3. `dialog.tsx:42`, `alert-dialog.tsx:39`, `sheet.tsx:40`: `bg-black/10 … supports-backdrop-filter:backdrop-blur-xs` → `bg-scrim`.
4. `button.tsx`: `default` to `hover:bg-primary-hover active:bg-primary-active`; `secondary` to `hover:bg-secondary-hover`.
5. Write `packages/ui/src/styles/tokens.test.ts`: parse the `:root` and `.dark` blocks, convert OKLCH to sRGB, compute WCAG ratios, assert: `foreground` on `background`, `card`, `muted` ≥ 4.5; `muted-foreground` on `background`, `muted`, `sidebar` ≥ 4.5; `primary-foreground` on `primary` ≥ 4.5; each tone text on its surface ≥ 4.5; `danger-solid` with white ≥ 4.5; tenant tag foregrounds on their tags ≥ 4.5; `ring` on `background`, `sidebar`, `muted` ≥ 3; `input` on `background`, `card`, `muted` ≥ 3; `tenant-prod-edge` on `background` ≥ 3; both themes.
6. Write `tests/design-tokens.test.ts` with the scan rules from Architecture and the allow-list from Exceptions, in report-only mode: one exported constant switches between "print offenders and pass" and "fail on any offender"; a unit test of the scanner itself asserts both modes on fixture strings.
7. Gate; run `smoke.test.ts` and `navigation.test.ts`.

## Scope detail and decisions the lead has already taken

- **Step 1.** The file is Appendix A character for character (the comment header included). Note the Appendix's closing notes: `--destructive` is no longer defined and `--color-destructive` maps to `--danger`; `--radius-*` are set directly in `@theme inline`; `--chart-*` are not repeated in `.dark`.
- **Step 2.** Search every primitive for `ring-3`, `ring-[3px]`, `ring-ring/50`, `ring-ring/40`, `focus-visible:ring-destructive/20` and similar alpha rings and bring them to the spec's exact class list. The `aria-invalid` ring that shadcn puts on inputs becomes `aria-invalid:ring-2 aria-invalid:ring-danger-edge aria-invalid:border-danger-edge` (the spec's Forms row: an invalid control gets `border-danger-edge`). Keep `outline-none`/`outline-hidden` where shadcn has it, because Appendix A adds a global `:focus-visible` outline for everything that has no ring of its own. Sidebar menu buttons: `ring-inset` so the scroll container does not clip the ring.
- **Step 3.** Overlays: `bg-scrim`, nothing else (no blur, no `supports-backdrop-filter:`).
- **Primitives' off-scale classes (your files, except badge.tsx and button.tsx).** Apply the spec's migration tables: `rounded-xl` → `rounded-lg` (Card, Dialog, Sheet); `rounded-[4px]`, `rounded-[2px]` → `rounded-sm` (Checkbox; the Tooltip arrow stays a rotated square, only its radius token changes); `rounded-[min(var(--radius-md),…)]` and `rounded-lg` on controls → `rounded-md`; `rounded` → `rounded-sm`; `px-2.5`/`py-2.5`/`gap-2.5`/`p-2.5`/`pl-2.5` → `3` for control padding-x and `2` for gaps; `mx-3.5` → `mx-3`; `0.5` and `1.5` stay in these files (exception). Shadows: only `shadow-md` on tooltips, popovers and menus and `shadow-lg` on dialogs and sheets; no `shadow-xs`/`shadow-sm` on controls or in-page surfaces (Card keeps `ring-1 ring-foreground/10`, not a shadow). Motion: colour and state transitions about 120 ms, overlays about 180 ms, as the spec's Motion paragraph says, where a primitive already declares a transition; do not add transitions where there were none. A fixed-height control centres its content with flex and `min-h`; more padding must not clip text or shrink a hit area; check Input and Button in the browser after the change.
- **`native-select.tsx`** keeps `bg-[Canvas] text-[CanvasText]` (forced-colours exception). **`card.tsx`** keeps `--card-spacing` and `gap-(--card-spacing)`.
- **Step 5, `tokens.test.ts`.** Write the OKLCH → linear sRGB → relative luminance → WCAG ratio maths yourself (about 30 lines; no new dependency, the standards forbid one for that). Parse the real `globals.css` from disk, both blocks, resolve every pair named in step 5 in both themes, and assert the thresholds. Print the computed ratios with `process.stdout.write` (Vitest drops a passing test's console output). If a pair in Appendix A fails its threshold, do NOT change the token: report the pair, the ratio and the theme to the lead, and leave the assertion failing in your report (the lead fixes the token once, in the spec and the code together).
- **Step 6, `tests/design-tokens.test.ts`.** The whole scanner lives in that one file (helpers, allow-list, mode switch, fixture tests, the scan over the tree); `tests/*.test.ts` is already in the Vitest `node` project and outside coverage. It scans `packages/*/src/**/*.{ts,tsx}`, skipping `*.test.ts(x)` and `globals.css`. Rules, from the spec's Architecture section:
  - Tailwind palette classes `(bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|divide)-(white|black|<palette>-\d+)` with every Tailwind palette name (`slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`), with or without a variant prefix (`dark:`, `hover:`, `border-t-…`) and with or without an alpha suffix (`/40`);
  - arbitrary colour values: `[#…]`, `rgb(`, `hsl(`, `oklch(`, `color-mix(`, `var(--color-<palette>-…)` in class strings or style props; colour literals (`#rrggbb` strings in `.ts`/`.tsx` code);
  - radius classes other than `rounded-(sm|md|lg|full)` and their direction variants (`rounded-t-lg`, `rounded-bl-sm`, …), and any `rounded-[…]`; a bare `rounded` is an offender too;
  - font-size classes other than `text-(xs|sm|base|lg|2xl|4xl)`, and arbitrary `text-[<length>]` (`text-[9px]`, `text-[0.8rem]`); `text-<colour>` tokens are not sizes, so match only the size names (`text-xl`, `text-3xl`, `text-5xl`, …);
  - spacing utilities (padding, margin, gap, space-between: `p px py pt pr pb pl ps pe m mx my mt mr mb ml ms me gap gap-x gap-y space-x space-y`, negative margins included) with steps `2.5|3.5|5|7` anywhere, arbitrary spacing values (`p-[13px]`) anywhere, `0.5|1.5` outside `packages/ui/src/components/`, and `16` outside `packages/app/src/app/page.tsx`, `packages/app/src/app/help/` and `packages/app/src/app/login/` (the Exceptions table's path rule). Sizes (`h- w- size- min-h- max-w-`) are not spacing;
  - `backdrop-blur`, `bg-gradient-*`, `bg-linear-*`, `bg-radial-*`;
  - emoji (Unicode Extended_Pictographic and the variation-selector/ZWJ sequences) in `.tsx` files and in `packages/app/src/i18n/messages/*.ts`;
  - `max-w-(2xl|xl|5xl)` in `packages/app/src/app/**/page.tsx`.
  - Allow-list, exactly the Exceptions table: the mammoth fills `#6D4534`, `#A56953`, `#FFDEA7`, `#1C1C1C` in `packages/app/src/components/layout/mammoth-mark.tsx` (not yet created; allow-list the path now); `#ffffff` in `packages/app/src/app/manifest.ts`; `bg-[Canvas] text-[CanvasText]` in `packages/ui/src/components/native-select.tsx`; `border-t-[3px]` in `packages/app/src/components/tenants/tenant-header.tsx`; `0.5`/`1.5` under `packages/ui/src/components/`; `--card-spacing` and `gap-(--card-spacing)` in `packages/ui/src/components/card.tsx` (not a literal); `16` spacing on the three public paths. An allow-listed string in any other file is still an offender.
  - Modes: `export const REPORT_ONLY = true;` (one constant, one line, with a comment saying the lead flips it at the close). In report-only mode the scan test writes every offender as `<repo-relative path>:<line>  <matched class or literal>` grouped per file with `process.stdout.write`, ends with a one-line total (`design-tokens: N offenders in M files`), and passes. In failing mode it fails with that same listing in the assertion message. Fixture tests call the scanner on in-memory strings and assert: each rule above fires on an example and does not fire on its allowed counterpart (`rounded-md`, `text-sm`, `p-4`, `bg-muted`, `text-muted-foreground`, `ring-foreground/10`; the scan bans palette names and the listed literals, not alpha suffixes on semantic colours, so keep each rule to what the spec lists); the allow-list suppresses exactly the listed string in the listed file and nothing else; both modes behave as described (report-only returns the offenders and does not throw; failing mode throws with the listing).
  - Judge the regexes against the real tree: after writing the scan, read its report-only output and spot-check ten offenders by hand to confirm each is a genuine offender under the spec, and grep for a few things the spec names (`text-zinc-600`, `rounded-2xl`, `px-2.5`, `backdrop-blur-xs`, `🦣`) to confirm each is reported. A scanner that misses what the spec names is not done.
- **Step 7.** Gate: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, each judged by its exit code (`npm run typecheck > /tmp/w1-typecheck.log 2>&1; echo exit=$?`), never through `| tail`. Then run `npm run test:integration -- tests/integration/smoke.test.ts` and `npm run test:integration -- tests/integration/navigation.test.ts`. Docker is unavailable on this machine: use the standalone-server method from `.ai/lessons.md` (2026-10-23 "Running integration tests against a local standalone server"), on port **3101**, with a fresh `DATA_DIR` from `mktemp -d`, `CPG_ADMIN_PASSWORD` set, `KEEP_ALIVE_TIMEOUT=3600000`, and `CPG_BASE_URL=http://localhost:3101` plus the same `CPG_ADMIN_PASSWORD` for the test run. Stop your server by port when done (`lsof -ti tcp:3101 | xargs kill`).
- **Browser check.** With that server running, open `/admin/test/materials` and `/login` with agent-browser (see `tests/integration/browser.ts` for how the repo drives it) in light and dark, tab through a few controls and take screenshots that show the focus ring, an input, a dialog overlay and a button hover; save them under `.ai/pipeline/runs/2026-10-24--0925UTC-design-system-v1/w1-artifacts/` with descriptive names and list them in your report. The browser is the final judge of a token: if a value in Appendix A renders wrong (an invisible ring, a clipped control), report it with the screenshot; do not patch it per screen.

## Repo rules (binding)

- Read `.ai/lessons.md` and `.ai/docs/engineering-standards.md` first; follow AGENTS.md.
- `npm ci` in your own worktree before anything else.
- Unit tests next to the code: every line, branch and function you add or change is covered; `npm run test:coverage` must stay at 100 % (never lower a threshold, widen an exclude or add a `v8 ignore`). The existing primitive tests (`*.test.tsx` beside each component) must be updated where they assert on classes you changed, and must keep asserting behaviour.
- The gate is judged by exit codes, never by a piped tail (lesson 2026-10-23).
- Integration: only `smoke.test.ts` and `navigation.test.ts`, against the standalone server as above.
- Commit on your branch with clear conventional messages (e.g. `feat(ui): design tokens v1 and opaque focus ring (W1)`), several commits are fine. Do not amend after reporting.

## Prohibitions

- Nothing outside "Owns" (as refined above). If you find a change needed elsewhere (an app test that asserts an old class, a consumer that duplicates a primitive's padding), do NOT make it: list it under "Needs the lead" in your report with file, line and the change you would make.
- No edits to the spec. Do not rename, move or "fix" `tests/design-tokens.test.ts` beyond creating it as specified; the lead flips its mode at the close.
- No PR, no push to `main`, no `git merge` of anything into your branch, no rebase onto another branch.
- Report rather than work around: a failing threshold in `tokens.test.ts`, a primitive that clips after the padding change, a lint rule that fights a class — report it.

## Report (through `cez task report`)

`--status done|partial|failed|blocked`, and in `--result`/`--evidence`:
- files changed (full list), tests added or changed (full list);
- every gate command with its exit code, and the test count and coverage line from `npm run test:coverage`;
- the two integration files' results (pass/fail, with the command);
- the report-only scan's total line (`design-tokens: N offenders in M files`) and its per-package counts;
- the computed contrast ratios from `tokens.test.ts` for both themes;
- screenshots saved and what they show;
- anything you could not do, and the "Needs the lead" list.
Be exact: a `done` that is not done costs the whole run a round trip.
