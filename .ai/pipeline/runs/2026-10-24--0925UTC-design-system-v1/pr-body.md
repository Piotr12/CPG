Implements `.ai/specs/implemented/2026-10-24--0842UTC-design-system-v1.md` end to end, as the one pull request decision D8 asked for: the tokens of Appendix A, the opaque focus ring and scrim overlays in every primitive, `StatusBadge`, `Callout` and `PageHeader`, the `Badge`/`Button`/`DataTable` contracts, `MammothMark`, the status tone map, the tenant wrappers, plain copy in both languages, the public pages, `PageHeader` and `LoadingMessage` on every admin page, the not-found, error and no-JavaScript states, the sidebar defaults, and the two enforcement tests (`tests/design-tokens.test.ts`, now failing on any offender outside the Exceptions table, and `packages/ui/src/styles/tokens.test.ts`). No product behaviour, business rule, route, API shape or permission changes.

Closes #203
Refs #204

## How it was built

A lead agent (Claude Fable 5.1) coordinated, validated and integrated; seven workers (Claude Opus 5.5) implemented the spec's units in disjoint file scopes, each merged with `git merge --no-ff` after its own gate and the lead's review, with the gate re-run on the merged tree every time. The run folder `.ai/pipeline/runs/2026-10-24--0925UTC-design-system-v1/` holds the plan, the decision log (`NOTIFY.md`), every brief and the workers' screenshots.

## Spec amendments made during implementation

Each was fixed once, in the spec and the code together, with the contrast pair pinned in `tokens.test.ts`:

- `destructive-solid` said `text-white`, which the spec's own scan bans: a `--danger-solid-foreground` token (white in both themes) carries the label.
- The invalid control border `danger-edge` measured 1.74:1 on white, below the 3:1 floor for a boundary: invalid controls use `border-danger` (6.62:1 light, 9.34:1 dark) and no invalid ring.
- The solid confirm button's hover: white on the dark `danger` is 2.12:1, so a `--danger-solid-hover` token (7.54:1 light, 7.92:1 dark) replaces `hover:bg-danger`; `destructive`'s hover darkens the border because `danger` on `danger-edge` is 3.80:1.
- The Motion paragraph's `prefers-reduced-motion` rule had no home: Appendix A gains the reduced-motion block.
- `StatusBadge`'s `px-1.5` lives in `badge.tsx` through `badgeVariants`, where the scan's path rule allows it.

- The error pages call `retry()` (Next.js 16.4 re-fetches and re-renders with it; `reset()` only re-renders), and the not-found and error pages render their title as the page's `h1` through `PageHeader`.
- The tone map also holds the import-row outcomes and the variance report's Waste mark.

The spec's Implementation notes list each with its reasoning.

## Acceptance criteria

- [x] Every representative screen (Tenants, Overview, Materials list and detail, a production order with a shortage, the import, the stock report, Help, home, login) at 320, 768 and 1440 px in light and dark: essential actions reachable, no horizontal page overflow, table overflow local, labelled and keyboard-operable. QA_EVIDENCE_LINE
- [x] `tokens.test.ts` passes every pair of the accessibility floor in both themes (50 pairs, 25 per theme; the lowest non-text pair is 3.83:1, the lowest text pair 5.50:1); the rendered focus, hover, disabled and invalid states are in the W1 and W2 screenshots and the QA captures.
- [x] Keyboard: focus visible on every control (the opaque `ring` plus a global `:focus-visible` outline), returned to the opener after a dialog closes (QA capture `keyboard-focus-*` and the dialog check).
- [x] Empty, filtered-empty, loading, successful and refused operations show the state and a next step from the States table (reader and writer empty states, "Clear filters", `LoadingMessage` on every page, success and refusal `Callout`s; a refused sign-in keeps the typed username).
- [x] With JavaScript disabled every page shows the `<noscript>` notice in both languages (`layout.test.tsx`; `p1-artifacts/nojs-*`).
- [x] English and Polish labels wrap without clipping or shrinking (every worker's `metrics.json` and the QA metrics report zero clipped controls).
- [x] Business quantities keep precision, unit and alignment (`quantity` kind: right-aligned `tabular-nums`); IDs are monospaced (`id` kind, cells only).
- [x] A mixed list of Open, Completed, Closed Early and Cancelled documents is distinguishable without colour (icon + label per status; P2's captures and the QA's customer-order list).
- [x] `tests/design-tokens.test.ts` fails on any palette class, off-scale radius, size or spacing, blur, gradient, emoji or brand-coloured utility outside the Exceptions table (41 fixture tests prove each rule) and passes on this branch with 0 offenders.
- [ ] Owner's judgement on density and touch accuracy on the realistic dataset (a populated Materials list, an order with long names and quantities, an import refusal, a tall dialog): the captures are attached; with the spec's `kind` minimum widths, ten-column tables scroll inside their container at 1,280 px with the sidebar expanded (see Deviations). Left to the owner, as the spec says.

## Deviations and follow-ups

- `error.tsx` and `global-error.tsx` are covered by unit tests only (no deterministic trigger in the production image), as the spec records; the not-found pages carry the integration test.
- The icon rail's default between 768 and 1023 px applies after hydration: a cold load shows the expanded sidebar for a frame.
- Ten-column tables (the requisition list: 1,342 px of minimum widths) and the audit table scroll inside their container at 1,280 px with the sidebar expanded; the page never scrolls sideways. Adjusting column priorities or row spacing is the spec's first lever if the owner finds it too dense.
- Three allow-list entries (`bg-[Canvas]`, `text-[CanvasText]`, `border-t-[3px]`) match no scan rule today and document the Exceptions table only.
- "Recipe" wording outside the one site the spec named stays and is filed as #206.
- Run-folder screenshots are viewport captures; the workers' 768 px captures were dropped from the folder (the QA evidence attached here covers 768 px).

## How it was verified

- Lead's gate on the final tree: `npm run lint` exit 0 (one pre-existing warning), `npm run typecheck` exit 0, `npm run test:coverage` exit 0 (531 files, 3,860 tests, 100 % lines, branches, functions and statements), `npm run build` exit 0; the gate was re-run after every one of the seven merges.
- INTEGRATION_LINE
- Every worker ran the integration files in its scope against its own standalone server (ports 3101–3114); the counts are in `NOTIFY.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
