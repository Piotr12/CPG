# Page the forecast list, and prove three E08 scenarios — #140

Source doc: .ai/specs/2026-10-21--2036UTC-forecast-paging-e08-proofs.md
Spec PR: #150
Status: in-progress
Engine: om-auto-create-pr (steps: 9, --loop: no)

## Goal
Page `GET /api/tenants/{tenant}/forecasts` and `/admin/{tenant}/forecasts` by 100 (`?page=`, filters before paging, today's order). Add the missing tests for SAL-025/LFC-020, SAL-024 and AUD-001, and update `CPG-acceptance.md` (issue #140).

## Scope
The spec's nine steps: service, schema/API, screen, docs and integration (phase 1), then the proof tests and the catalogue (phase 2). No migration, no response-shape change, no MRP netting (#14), no shipment edit or cancel (#147).

## Non-goals
- Paging any other list.
- Changing the forecasts page's handling of a malformed filter (it is still ignored).

## Risks
- Ordering by business ID, not by the UUID a forecast references (lesson 2026-10-21). The tests must reach the sort out of order.
- A partial `fields` read must still return `version`, since edits carry it.
- An existing integration check expects 120 rows on Test's screen (`forecasts.test.ts:101-104`).
- The implementation branch is stacked on the spec branch (#150), so it carries the spec commit, as #135 did with #132.

## Log
- 20:42 UTC — Plan drafted from the spec's Implementation Plan: 9 steps, under the threshold of 20, so the plain engine runs.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Paged forecast list

- [ ] 1.1 Service: `list(filter, page)` and `count(filter)`
- [ ] 1.2 Schema and API: `forecastListQuerySchema`, the route forwards `page`
- [ ] 1.3 Screen: parse and clamp `page`, `PageLinks` keeping the filter, EN/PL labels
- [ ] 1.4 Docs: `BACKWARD_COMPATIBILITY.md` §4 and the help topic
- [ ] 1.5 Integration: API and screen paging on Test, rewrite the 120-row check

### Phase 2: E08 proofs

- [ ] 2.1 SAL-025 / LFC-020: ship and issue after the customer's deactivation
- [ ] 2.2 SAL-024: a reasoned positive correction leaves a completed order fulfilled
- [ ] 2.3 AUD-001: a normal user's customer-order create entry names their account
- [ ] 2.4 Catalogue: `CPG-acceptance.md` statuses and evidence
