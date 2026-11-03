# Execution plan: MRP end-to-end journeys (#291)

Source doc: .ai/specs/implemented/2026-11-03--0626UTC-mrp-end-to-end-journeys.md
Spec PR: #364 · Issue: #291 · Branch: `feat/mrp-end-to-end-journeys` (from `main`, lesson 2026-11-02: the spec is carried straight into `implemented/`)
Engine: om-auto-create-pr (steps: 10, --loop: no)

## Goal
Integration tests that run the twelve cross-domain journeys (E2E-001, 002, 003, 005, 007, 008, 012, 015, 016, 019, 021 and E2E-010's MRP half) through the screens and the bearer API, prove UX-023's planning half, and run MRP on screen over the realistic Test dataset; then promote the catalogue rows.

## Scope
- `tests/integration/journeys.ts` (new helper), four `e2e-*.test.ts` files, additions to `test-reset-api.test.ts` and `test-reset-realistic.test.ts`.
- `.ai/specs/research/CPG-acceptance.md`.
- `.github/workflows/ci.yml` only if a shard passes 14 min (spec Q10).

**Non-goals:** product code changes (a defect becomes a bug issue, spec Q11), E20-S03's catalogue-wide recheck, E20-S01's tooltips.

## Risks
- Suite time: measured per file, with shards checked on CI (Q10).
- Prod growth: list headroom recorded after a full local run.
- No Docker here: integration files run against a local standalone server (lesson 2026-10-23). The full suite runs on CI.

## Implementation Plan

### Phase 1: Journeys
1. `journeys.ts`: API client with the finance-key walk, screen run and accept, and file accounts.
2. `e2e-supply-chain.test.ts`: E2E-001, E2E-015.
3. `e2e-planning.test.ts`: E2E-002, E2E-003, E2E-016.
4. `e2e-corrections.test.ts`: E2E-007, E2E-008, E2E-012, E2E-019.
5. `e2e-automatic.test.ts`: E2E-005, E2E-021.
6. E2E-010's MRP half in `test-reset-api.test.ts`.
7. The realistic screen run in `test-reset-realistic.test.ts`.
8. UX-023's file-level assertions.

### Phase 2: Verification and catalogue
9. Full order on one server; times and Prod headroom; CI shard check.
10. Catalogue rows, spec moved to implemented, run log, lessons; full gate.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Journeys

- [x] 1.1 journeys.ts helper — 128a081d
- [x] 1.2 e2e-supply-chain: E2E-001, E2E-015 — 128a081d
- [x] 1.3 e2e-planning: E2E-002, E2E-003, E2E-016 — 2a5570df
- [x] 1.4 e2e-corrections: E2E-007, E2E-008, E2E-012, E2E-019 — 6a573f01
- [ ] 1.5 e2e-automatic: E2E-005, E2E-021
- [ ] 1.6 E2E-010 MRP half
- [ ] 1.7 Realistic screen run
- [ ] 1.8 UX-023 file-level assertions

### Phase 2: Verification and catalogue

- [ ] 2.1 Full order on one server, times, Prod headroom, CI shards
- [ ] 2.2 Catalogue, spec status, run log, lessons, full gate

## Delivery: lead and workers (from step 1.4)

Steps 1.4–1.7 are disjoint files, so three cezar workers run them in parallel, one file group each. The lead keeps `journeys.ts`, the plan, the catalogue and the PR. Each worker's objective names its file, its journeys and its port. Everything they share is here.

**Read first:** `AGENTS.md`, `.ai/lessons.md` ("Integration tests and agent-browser" above all), the spec (`.ai/specs/implemented/2026-11-03--0626UTC-mrp-end-to-end-journeys.md`: Q2–Q11 and the journey's bullets), `tests/integration/journeys.ts`, and `e2e-supply-chain.test.ts` / `e2e-planning.test.ts` as the model to copy.

**Rules**
- Edit only the files your objective names. **Never edit `journeys.ts`.** If you need a helper, define it in your own file, and name it in your report's suggestions so the lead can move it.
- No product code changes. If a journey exposes a defect (spec Q11), first check the code to be sure it is the product and not the test. Then file a `bug` issue with `gh issue create --label bug,priority-high,risk-medium`, naming the owning story, steps, expected and actual (see #369 for the shape). Keep the failing clause alone in an `it.fails("E2E-0xx (#N): …")` test. Temporarily make it `it` once, and check it fails on the clause, not on setup. The rest of the journey stays a normal test, working around the defect as E2E-002 does.
- Known defect: **#369**. A Make pair whose only demand is a provisional parent short of that pair stays provisional. It hits E2E-021's "rerun permits higher-level executable orders".
- Commit on your own branch (conventional commits, `(#291)`, the attribution line). **Never push**, and never comment on PRs or issues except to file a bug.

**Local server** (no Docker here; lesson 2026-10-23):
- `npm ci`, then `npm run build` in your worktree.
- For **every** pass, copy `packages/app/.next/standalone/.` into a new `mktemp -d` dir, adding `.next/static` under `packages/app/.next/` and `packages/app/public` beside `server.js`.
- Start `node packages/app/server.js` with `PORT=<your port> HOSTNAME=127.0.0.1`, a fresh `DATA_DIR=$(mktemp -d /tmp/cpg-data-XXXX)`, `CPG_ADMIN_PASSWORD=…` and `KEEP_ALIVE_TIMEOUT=3600000`. Wait for `/up`.
- Run `CPG_BASE_URL=http://127.0.0.1:<port> CPG_ADMIN_PASSWORD=… npx vitest run --config vitest.integration.config.mts <file> [-t <name>]`.
- A second pass on a used server fails on fixed usernames, so restart for every pass: `lsof -ti tcp:<port> | xargs kill`.
- Run the file whole, then each test alone with `-t`. Stop your server when done.

**Pitfalls the lead already hit**
- A list's `q` matches different fields per list. Requisitions match their own ID, the material and the location. Purchase orders match their own ID, the supplier and the location. Production orders match their own ID and the output only. A wrong `q` silently returns other rows, or none.
- "Why this BOM" is a closed Collapsible: click `[data-mrp-why-bom] button` before reading `[data-mrp-shortage]`.
- A bucket's `projectedBefore` excludes proposals, so `safetyGap(bucket)` is the gap before planning.
- Read MRP figures as the API strings (`"10.000000"`). Check a field's real name and shape in `packages/core/src` before asserting it, and run the test rather than guessing.
- `-t` is a regex: escape `(`, or match on `#369`.

**Report** (`cez task report`): status, what each test asserts per catalogue Then clause, any bug filed, the commands run with their pass counts, each file's local duration, and the commit SHA.
