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

TODO (close): the remaining amendments, the deviation list, the acceptance criteria ticked with evidence, the QA evidence link.

## Acceptance criteria

TODO (close): tick each with its evidence.

## Deviations and follow-ups

- `error.tsx` and `global-error.tsx` are covered by unit tests only (no deterministic trigger in the production image), as the spec records; the not-found pages carry the integration test.
- TODO (close).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
