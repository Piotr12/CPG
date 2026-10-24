# Design system v1: file the alignment issue from two proposals

**Date:** 2026-10-24 08:19 UTC
**Agent:** Claude Code (Fable 5.1) via cezar, `om-prepare-issue`
**Spec:** none yet — the owner asked for the discussion first; a small spec PR follows once the issue's questions are answered
**Status:** partial — issue #203 filed with the questions and decisions; waiting for the owner's answers before the spec PR

## Goal

The owner pasted two independent design-system proposals for CPG (A: "CPG design system — application guide", B: "CPG Design System v1") and asked for one distilled system, decided inside a GitHub issue: up to 10 weight-bearing questions for the owner, every other decision made by the agent and recorded in the issue, then a spec PR once the discussion closes. No mockups or screens; prose only.

## Log

- 08:19 UTC — Read both documents in full, the skill and its references, `AGENTS.md`, `.ai/lessons.md`, `SDLC.md` (label inference; it has no ticket-level Definition of Ready section), `BACKWARD_COMPATIBILITY.md`, the product brief, the menu-revamp brief and the sidebar spec.
- Duplicate search (open issues, four queries: design system, design tokens, UI audit/styling/theme, StatusBadge/Callout; open PRs; the full open-issue list of 16): nothing covers this. No `.uxproof/` contract exists.
- Verified the documents' audit claims against `main` at `74d9519a` before quoting them (details in the issue's "Verified" section): 6 emoji sites, 27 palette-class occurrences in 14 non-test files, 23 blank `aria-busy` Suspense fallbacks vs 12 `LoadingMessage`, `rounded-4xl` Badge pill, `text-[0.8rem]` and `color-mix()` in Button, `bg-black/10 backdrop-blur-xs` on three overlays, dark `--sidebar-primary` indigo, `--ring/50` focus, `rounded-[5px]`/`text-[9px]` in the tenant switch, amber/red literals in the three tenant components, the initial avatar, the zinc home and help pages, `en.ts:686` title pattern, no `not-found.tsx`/`error.tsx`, `collapsible="icon"` already in use, `icon.svg` fills, 12 `<Badge variant="secondary">` status sites, "Cave control" asserted in 11 unit-test files and 4 integration files.
- Decision: B is the base (audit-traceable, file:line migration, component contracts, rollout, enforcement, build-verified token file); A is grafted where B is silent (states and copy, screen archetypes, input-boundary contrast, target sizes, motion, dialog and reflow rules, artwork exceptions, ownership). B's five "owner decisions" D1–D5 are re-asked only where A conflicts, because the owner asked to have their say in this issue.
- Deviation from the skill's step 3: a feature of this size would normally get its spec authored now via `om-auto-write-spec`. The owner explicitly asked for questions first and the spec PR after; the issue says so and names the follow-up.
- Protected surfaces: none touched (page URLs, help topic ids, API paths and envelopes unchanged; "Cave control" appears in the API route only as a comment).
- Labels: `feature` (new shared components and pages), `priority-medium` (net-new feature), `risk-high` (broad cross-cutting edits across every screen and the shared primitives, per SDLC).

## Changes

- This run log.
- Tracker: issue #203 (https://github.com/Piotr12/CPG/issues/203) with labels `feature`, `priority-medium`, `risk-high`; four comments: source A verbatim, source B verbatim in two parts (its 65 KB exceeds one comment), and the label rationale. Seven questions for the owner (base document, voice, brand mark, status colours, JavaScript, navigation defaults, spec scope); every other decision in nine collapsed tables, each row marked A, B, both or agent.

## Verification

- `gh auth status` OK (gh 2.102.1 ≥ 2.82.1).
- Repository checks not run: this run changes no source files.

## Follow-ups

- When the owner answers the questions: update the issue body (strike answered questions, move outcomes into the decided table), then open the small spec PR under `.ai/specs/` that phases the work, committing this run log with it.
