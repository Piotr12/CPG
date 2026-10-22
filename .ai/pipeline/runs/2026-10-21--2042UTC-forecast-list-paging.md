# Page the forecast list, and prove three E08 scenarios — #140

Source doc: .ai/specs/implemented/2026-10-21--2036UTC-forecast-paging-e08-proofs.md
Spec PR: #150
Status: complete
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
- 2026-10-22 10:45 UTC — `om-auto-fix-pr`: merged `main` with #165 (Test starts tiny; #163 fixed). The one conflict, in `.ai/lessons.md`, kept both sides. Tiny keeps every forecast bucket (`test-datasets.test.ts:27`), so Test still starts with 120 forecasts, and the paging checks still hold (seed log: "120 forecasts"). Gate after the merge: lint, typecheck, build exit 0; `npm run test:coverage` exit 0 (484 files / 3,285 tests, 100%). An earlier run hit 5 s timeouts in unrelated DOM tests while the machine's load average was 27–70 from parallel sessions; it passed once the load dropped. The 4 touched integration files pass 35/35 on a fresh standalone copy. The review (a9c4929) and the UI evidence stand: since then only the run logs and the merge changed.
- 21:27 UTC — CI on c39b45a: lint, typecheck, build and unit tests pass. Integration: 375/377 pass, and all four touched files pass. The 2 failures are the `test-reset.test.ts` UI resets, which time out at 25 s. `main` (1882d6a, since #136) and other branches fail them too, tracked as #163. Not caused by this change.
- 21:05 UTC — Fresh-context code review: approve, with 2 lows and 2 nits. Fixed: `count` no longer loads the master code maps (only `list` does); the AUD-001 integration assertion also checks the entry's new values; the header's scenario list is back in order. Kept: the one-line `codeById` duplicate of the stock report's (the standards allow it). After the fixes, lint, typecheck, coverage (483 files / 3,278 tests, 100%) and build pass, and the 4 integration files pass 35/35 on a fresh standalone copy.
- 20:56 UTC — Browser QA on the standalone build: page 1 shows 100 rows and "Page 1 of 2"; Next opens `?page=2` with 20 rows; `?page=9` shows page 2; `?page=0` is the 404; a material filter shows 12 rows and no links; at 390 px there is no horizontal overflow. Screenshots in `.ai/qa/pr-156/`.
- 20:55 UTC — Touched integration files on a fresh standalone copy with fresh data (Docker isn't running here): `forecasts`, `forecasts-api`, `shipments-api`, `customer-orders`, 4 files / 35 tests pass.
- 20:53 UTC — Gate green: lint exit 0 (one existing warning in `bom.service.ts`), typecheck exit 0, `npm run test:coverage` exit 0 (483 files / 3,278 tests, 100%), build exit 0. The first coverage run missed one branch, the page links with only a material filter; fixed in 7ccdbbc.
- 20:48 UTC — The SAL-024 tests also prove INV-017, so that scenario passes too. `forecasts-api.test.ts` asserted all 120 Test forecasts in one response, which the spec review hadn't flagged; rewritten for two pages.
- 20:42 UTC — Plan drafted from the spec's Implementation Plan: 9 steps, under the threshold of 20, so the plain engine runs.

## Progress

PR: #156

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Paged forecast list

- [x] 1.1 Service: `list(filter, page)` and `count(filter)` — 367cd9d
- [x] 1.2 Schema and API: `forecastListQuerySchema`, the route forwards `page` — 367cd9d
- [x] 1.3 Screen: parse and clamp `page`, `PageLinks` keeping the filter, EN/PL labels — 7f5939d
- [x] 1.4 Docs: `BACKWARD_COMPATIBILITY.md` §4 and the help topic — cda97c1
- [x] 1.5 Integration: API and screen paging on Test, rewrite the 120-row check — 1bdee7c

### Phase 2: E08 proofs

- [x] 2.1 SAL-025 / LFC-020: ship and issue after the customer's deactivation — 0f966c0
- [x] 2.2 SAL-024: a reasoned positive correction leaves a completed order fulfilled — 0f966c0
- [x] 2.3 AUD-001: a normal user's customer-order create entry names their account — 391aa27
- [x] 2.4 Catalogue: `CPG-acceptance.md` statuses and evidence — b2ac9b1
