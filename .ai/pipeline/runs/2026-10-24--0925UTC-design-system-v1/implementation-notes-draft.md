# Implementation notes (draft for the spec, appended at the close)

## Implementation notes

Implemented on 2026-10-24 in one pull request by a lead agent (Claude Fable 5.1) and seven workers (Claude Opus 5.5), per decision D8; the run folder `.ai/pipeline/runs/2026-10-24--0925UTC-design-system-v1/` holds the plan, the decision log, the briefs and the screenshots.

### Amendments made during implementation (spec and code together)

- **`--danger-solid-foreground`** (`oklch(1 0 0)`, both themes): `destructive-solid`'s label. The contract said `text-white`, which the spec's own scan bans.
- **`--danger-solid-hover`** (`oklch(0.47 0.19 27)` light, `oklch(0.45 0.12 22)` dark): the solid confirm button's hover fill. White on the dark `danger` is 2.12:1, so `hover:bg-danger` failed there. `destructive`'s hover darkens the border (`hover:border-danger`), because `danger` on `danger-edge` is 3.80:1.
- **Invalid control border `border-danger`**, not `border-danger-edge` (1.74:1 on white, below the 3:1 floor for a boundary), and no invalid ring; `tokens.test.ts` pins `danger` on `background`, `card` and `muted` ≥ 3.
- **`prefers-reduced-motion`**: Appendix A gains the reduced-motion block the Motion paragraph asked for.
- **`StatusBadge`'s `px-1.5`** lives in `badge.tsx` through `badgeVariants`, where the scan's path rule allows it.
- **`retry()`, not `reset()`**: Next.js 16.4's error boundary receives `retry`, which re-fetches and re-renders; `reset` only re-renders, so a server error would recur.
- **An `h1` on the state pages**: the not-found and error pages render their title through `PageHeader`, with `EmptyState`-style next steps and `ErrorMessage` as the content, so "one `h1` per page" holds there too.

### Decisions taken by the lead

- Parallel units could add dictionary keys only inside their own concept sections of `en.ts`/`pl.ts` (the spec's "never share a file" rule read as "never share a hunk"); every such key is listed in the units' reports.
- Workers were authorised, case by case, to change the one assertion or selector outside their scope that their change moved (the `ConfirmDialog` variant, the lifecycle labels, the chooser text, the BOM status, the unknown-tenant text); each is recorded in `NOTIFY.md`.
- The eight full-page Help captures were cropped to one viewport each; `w3-artifacts/metrics.json` keeps the full-page measurements.
- The Polish plural of the shortage title needs a `few` form; the shared `counted` helper has none, so the production screen carries its own `{ one, few, other }` helper.

### Deviations and known limitations

- `error.tsx` and `global-error.tsx` are covered by unit tests only (no deterministic trigger in the production image); the not-found pages carry the integration test.
- The icon rail's default between 768 and 1023 px is applied after hydration, so a cold load shows the expanded sidebar for a frame; a CSS-first default would need the sidebar provider.
- A 320 px screenshot with JavaScript off is not capturable with agent-browser; `p1-artifacts/nojs-320-metrics.json` records the notice's box and the absence of overflow instead.
- Three allow-list entries (`bg-[Canvas]`, `text-[CanvasText]`, `border-t-[3px]`) match no scan rule and document the Exceptions table only.
- "Recipe" wording outside the one site the spec names (16 English values, 18 Polish lines, 23 help lines) — TODO at the close: swept or filed as a follow-up.
