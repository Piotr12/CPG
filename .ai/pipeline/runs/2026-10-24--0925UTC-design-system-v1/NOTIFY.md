# Notify — 2026-10-24--0925UTC-design-system-v1

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-10-24T09:25:00Z — run started
- Brief: implement `.ai/specs/2026-10-24--0842UTC-design-system-v1.md` end to end as one PR against `main` (decision D8; Closes #203, Refs #204).
- Lead: Claude Code (claude-fable-5-1) in cezar task `eb7fb400`, branch `cez/eb7fb400`. Workers: cezar child tasks on claude-opus-5-5, forked from this branch's committed tip, one worktree each.
- Environment: Node v24.15.0, npm 11.12.1, gh 2.102.1 (Piotr12). Docker unavailable: integration files run against a local standalone server (lesson 2026-10-23). agent-browser is installed.
- Decision: this run folder is the run log; no separate `.ai/runs/` file (`.ai/skills/om-auto-create-pr-loop/SKILL.md`).

## 2026-10-24T09:40:00Z — W1 brief and scope decisions
- Decision: inside `packages/ui/src/components/**`, `badge.tsx` and `button.tsx` are W2's (the restyle); W1 touches them only for the focus ring (step 2) and the button hover/active tokens (step 4). Every other primitive is W1's in full, including its off-scale radius, spacing and font-size classes from the migration tables, because no other unit owns those files and the Close would otherwise find offenders without an owner.
- Decision: the scan's spacing rule covers padding, margin, gap and space-between utilities; sizes (`h- w- size- min-h- max-w-`) are not spacing. The Exceptions table's `16` path rule is implemented (flag `16` spacing outside home, Help and login).
- Decision: integration ports per worker, so parallel standalone servers never collide: lead 3100, W1 3101, W2 3102, W3 3103, P1 3111, P2 3112, P3 3113, P4 3114.
- Briefs are kept under `briefs/` in this folder; W1's is `briefs/w1-tokens-and-focus.md`.

## 2026-10-24T09:58:00Z — W1 dispatched; W2 and W3 briefs drafted
- W1 dispatched as cezar child `a6a67846` (claude-opus-5-5); objective points at `briefs/w1-tokens-and-focus.md` (the dispatch command caps the objective at 4,000 characters, so every brief lives in this folder and the objective summarises it).
- Decision (spec amendment, to be recorded in the spec at the close and in the PR body): the `destructive-solid` button's `text-white` is banned by the spec's own scan rule, so a token `--danger-solid-foreground` (`oklch(1 0 0)` in both themes, `--color-danger-solid-foreground`) is added to Appendix A by the lead after W1 merges, with the `danger-solid-foreground` on `danger-solid` ≥ 4.5 pair in `tokens.test.ts`; `destructive-solid` is `bg-danger-solid text-danger-solid-foreground`.
- Decision: W2 also owns `packages/ui/src/components/table.tsx` for the scroll container (`tabIndex`, label, sticky column), since `Table` renders its own container div.
- Decision: W3 may swap the heading key in `admin/[tenant]/page.tsx` (`admin.heading` → `admin.tenantHeading`) and may update any test assertion anywhere that asserts the exact text of a string it changes; it changes nothing else in those files. Other "recipe" strings stay; W3 inventories them for the lead.
- Decision: `app/src/app/manifest.ts:4` (the comment pointing at `--background`) is the lead's at the close; no unit owns the file.
- Decision: `app-footer.tsx`'s 70ch wrap ("the footer sentence … wraps within about 70ch") goes to P4, which owns `components/layout/**`.

## 2026-10-24T10:40:00Z — W1 validated and merged (5bea1416); lead amendments
- W1 (child a6a67846, $5.89, 38 files) settled `done`. Validated: `globals.css` equals Appendix A byte for byte (awk-extracted diff empty); every primitive's focus ring is the opaque `ring-2 ring-ring ring-offset-2`; overlays are `bg-scrim`; radii, spacing and shadows per the migration tables; `tokens.test.ts` (47 tests, 42 pairs, all passing) and `tests/design-tokens.test.ts` (41 tests, report-only: 126 offenders in 31 files, app 117, ui 9 in badge/button for W2). Worker gate exit codes all 0; smoke 3/3 and navigation 16/16 on port 3101. Screenshots in `w1-artifacts/`. Merged with `git merge --no-ff`.
- W1 reported four findings; the lead's decisions, each applied in the spec and the code together:
  - `destructive-solid`'s `text-white` is banned by the scan: token `--danger-solid-foreground` (`oklch(1 0 0)`, both themes) added to Appendix A and `globals.css`; the Button row and the token table amended; `tokens.test.ts` asserts `danger-solid-foreground` on `danger-solid` ≥ 4.5 (5.89 light, 5.61 dark).
  - The invalid control border `danger-edge` measured 1.74:1 on white (W1's screenshot `materials-light-dialog-invalid-inputs.png`): the Forms row now says `border-danger`; input, native-select, checkbox, button and badge use `aria-invalid:border-danger` and no invalid ring (so no `aria-invalid:focus-visible:ring-ring` override is needed); `tokens.test.ts` asserts `danger` on background, card and muted ≥ 3 (6.62/6.62/6.07 light, 9.34/8.46/7.14 dark).
  - The Motion paragraph's `prefers-reduced-motion` rule had no home: Appendix A and `globals.css` gain the standard reduced-motion block in the base layer.
  - Three allow-list entries (`bg-[Canvas]`, `text-[CanvasText]`, `border-t-[3px]`) match no scan rule today; kept as documentation of the Exceptions table, no rule widened (the spec lists the rules; noted for the PR body).
  - `button.tsx`'s outline variant still has `dark:bg-input/30` fills (grey buttons in dark, W1's screenshot `materials-dark-dialog-invalid-focus.png`): W2's brief already removes them.
- Two lessons added to `.ai/lessons.md` (UI): `--input` is a boundary, never a fill; Tailwind 4 orders `aria-*` after `focus-visible`.
- Gate on the merged tree with the amendments: running (lint, typecheck, test:coverage, build), judged by exit codes; W2 is dispatched once it is green.
- Gate on the merged tree after the amendments: lint exit 0 (one pre-existing warning), typecheck exit 0, test:coverage exit 0 (500 files, 3,657 tests, 100 %), build exit 0. Scan: 126 offenders in 31 files (app 117, ui 9). W2 dispatched.
