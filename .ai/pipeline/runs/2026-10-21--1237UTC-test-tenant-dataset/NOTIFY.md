# Notify — 2026-10-21--1237UTC-test-tenant-dataset

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-10-21T12:39:23Z — run started
- Brief: implement `.ai/specs/2026-10-21--0718UTC-test-tenant-dataset.md` (Closes #126; design PR #127 merged).
- External skill URLs: none
- Engine: om-auto-create-pr-loop (steps: 28, --loop: no) — plan exceeds the 20-Step threshold.
- Decision: the owner merged design PR #127, read as acceptance of the spec's ⚠ defaults (Q2, Q4, Q6, Q16).
- Decision: Phase 2 renames each document service's fixture `seedDemo()` to `seedFixtures()` so every commit stays green; Phase 3 deletes it. The timing spike runs on the real seeder (Step 3.2).

## 2026-10-21T13:09:44Z — group A (Steps 1.1–1.6) decisions
- Decision: the first history month's documents are created in the setup month (spec Q3), not clamped to the history start ("never earlier than the history start" in "Demand" read as "never before the setup month").
- Decision: today's partial and open shipments go to each plant's first and second open orders with no shipment created before today; otherwise the first order by required date usually already holds its regular open shipment. A plant with only one such order gets no open shipment that day (weekday 12–13 at Poznań, a few days a year).
- Decision: variances count only completions whose recipe has a raw component measured in kg or l, and the 3 %/2 % delta is what is rounded up to 0.1.
- Decision: config keys beyond the spec's table: demand.customers[] names the customer by ID with a wholePacks flag (not by name); enteredIn is a unit name (the base unit instead of the literal "base"); supply.overConsumption/underConsumption, supply.waste, supply.requisitions and supply.topUps hold the rules' materials and plants (top-up sheet: steel 2 mm at Wrocław, steel 1.0 mm elsewhere).
- Decision: limits.documents counts every timeline event except the four opening postings. Openings are derived (safety + one minimum lot), so the zero-opening replay test zeroes the timeline's openings rather than a config value.

## 2026-10-21T13:11:15Z — checkpoint 1 (Steps 1.1..1.6)
- Phase 1 generator landed (6cdb5f7..81c37bd) through one capable executor (group A, tier capable → opus). Typecheck, lint and 100 % coverage of `domain/demo` pass; the every-day replay passes for 730 days in ~3.5 s.
- Decision: executors leave the Tasks-table Commit cell with the pre-amend SHA; the next checkpoint corrects it to the pushed SHA.

## 2026-10-21T13:21:12Z — checkpoint 2 (Steps 2.1..2.7)
- Groups B and C (tier standard → sonnet) landed 0ff1db5..60103f6; full gate subset green: typecheck, lint, test:coverage 100 % (3,240 tests).
- 2.2's commit alone left the reset test red (fixed in 2.4); recorded, not rewritten.

## 2026-10-21T13:29:35Z — checkpoint 3 (Steps 2.8..2.11, Phase 2 closed)
- Groups D (standard → sonnet) and E (cheap → haiku) landed 002997f..3aed882; typecheck, lint, test:coverage 100 % (3,253 tests).

## 2026-10-21T13:35:12Z — Step 3.2 seed timing spike
- Full committed configuration, today 2026-10-21: 26 materials, 4 locations, 10 customers, 6 suppliers, 48 planning parameter sets, 50 safety-stock targets, 16 BOMs, 120 forecasts, 4 openings, 589 customer orders, 640 shipments, 630 goods issues, 5 requisitions, 466 purchase orders, 450 receipts, 390 production orders, 379 completions (3,748 movements).
- In one transaction (`inRequestTransaction`, as startup and the reset will run it) against a fresh SQLite file, Node in-process on the dev Mac (Apple silicon): **8.7 s** and **8.1 s** (two runs). Without an outer transaction (each document its own commit): 8.7 s.
- Within the 15 s budget locally. The production image on the CI runner is measured at Step 4.5 (startup and reset); if it misses, the first lever is fewer queries per document on the seed path.
- Deviation (planned): the spike ran on the real seeder (Step 3.1) rather than a throwaway one.
