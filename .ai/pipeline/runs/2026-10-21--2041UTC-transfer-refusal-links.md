# Link the transfer that blocks a deactivation, and prove the stock import's remaining scenarios — #139

Source doc: .ai/specs/2026-10-21--2035UTC-transfer-refusal-links.md
Spec PR: #149
Status: in-progress
Engine: om-auto-create-pr (steps: 8, --loop: no)

## Goal
A deactivation refused by an Open transfer links to `/admin/{tenant}/transfers/{id}`, as production-order refusals link to their order (LFC-018). Tests for STX-006, STX-018 (both channels) and the location `STOCK_NOT_EMPTY` parameters (LFC-016). `CPG-acceptance.md` updated (issue #139, E07-S04).

## Scope
The spec's two phases plus the paperwork: the generalised `deactivationBlockerError` in `components/master-data/` and its two callers, unit and integration tests, the acceptance doc, and the spec move. Non-goals: the deactivation rules, the API's error shape, the import report's text, the message copy.

## Risks
- Deactivation checks physical stock before transfers, so the link's integration test uses its own unstocked material and locations (spec review, High).
- Integration files share one Prod database: the STX-018 UI test filters audit entries by a reason only it uses, and commits a material of its own.
- The implementation branch is based on the spec branch (as #135 was on #132), so it carries the spec commits; #149 merges first.

## Log
- 20:41 UTC — Began from `spec/transfer-refusal-links` (8a12eaa) on `feat/transfer-refusal-links` in the cezar worktree.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Link transfer refusals (LFC-018)

- [ ] 1.1 Generalise the blocker link into `deactivationBlockerError`, switch its two callers, unit tests at 100%.
- [ ] 1.2 Integration: the location's and the material's Deactivate refusals link the Open transfer.

### Phase 2: Prove the stock import's remaining scenarios (STX-006, STX-018, LFC-016)

- [ ] 2.1 Service test: a site the workbook leaves out keeps its balances and gets no movement (STX-006).
- [ ] 2.2 Action test: an admin session commits with the admin's `uiActor` (STX-018).
- [ ] 2.3 Integration: the admin's UI commit is audited with the admin's account, session and `ui` (STX-018).
- [ ] 2.4 Integration: the admin's API commit names the admin and `api` (STX-018).
- [ ] 2.5 Service test: the location `STOCK_NOT_EMPTY` refusal carries its parameters (LFC-016).

### Phase 3: Paperwork

- [ ] 3.1 Acceptance doc, spec to `implemented/`, lessons.
