# Spec and issue: single-site, daily-demand realistic Test dataset

**Date:** 2026-10-25 08:48 UTC
**Agent:** Claude Code (claude-opus-5-5), dispatched by cezar
**Spec:** `.ai/specs/2026-10-25--0848UTC-single-site-daily-dataset.md`
**Status:** done

## Goal

The owner asked for an issue and a draft spec reworking the realistic Test dataset: one plant, five furniture types with shared intermediates, more paint colours, two suppliers, two years of daily history and a year of daily forecast, with seasonality, an upward trend and noise. The questions go back through the issue, each with a suggested answer, for the owner to review. No implementation.

## Log

- 08:43: read `lessons.md`, the #126 and #163 specs, `test-tenant-config.json`, `test-datasets.ts`, `demand-plan.ts`, `generate-dataset.ts` and `seed-demo-data.ts`, and the tests that pin the seeded names.
- Found that tiny and realistic share one catalogue (#163 Q1), so "not the integration tests one" needs a decision (Q11). The suggested answer keeps one catalogue.
- Read "five types of furniture" plus "more paint colours" as the five composed products in colour variants painted at final assembly (Q1, Q2). The alternatives are on the issue.
- 08:48: `gh` couldn't resolve api.github.com (DNS). Wrote the spec locally first, then created the issue (#237) and the PR once the network was back.
- 09:55: posted Q1–Q14 with suggested answers on #237 and opened PR #238 with the draft spec.
- 08:57 (owner, on #237): Q1–Q4 as suggested. Q5: four customers, one buying everything, one growing about 10 % a quarter and one slightly declining. Overall growth 10 % a year. Everything else as suggested. #237 stays open to track the implementation.
- Spec updated to `ready` with a Decisions table. Customers: 00000001 hardware chain (declining 1.5 %/quarter), 00000002 Office Interiors and 00000004 export distributor (the remainder), 00000003 online shop (every SKU, +10 %/quarter).
- Deviation, flagged on #237: Q6's suggested "lines by required date equal D every day" can't hold with a customer whose share grows 10 % a quarter, because a weekly customer's share would apply to one day in five. Daily demand is now split into per-customer streams with cumulative rounding, summing to D every day. The online shop orders its stream daily; B2B customers order theirs per delivery period. Volume estimate down to about 6,100 documents and 15,000 movements, under the accepted caps.

## Changes

- `.ai/specs/2026-10-25--0848UTC-single-site-daily-dataset.md` (draft spec)
- this run log

## Verification

- Docs only. `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 6 tests passed (exit 0).

## Follow-ups

- Implement the spec in its own PR, referencing #237 without a closing keyword: the owner tracks the implementation there.
