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

## Changes

- `.ai/specs/2026-10-25--0848UTC-single-site-daily-dataset.md` (draft spec)
- this run log

## Verification

- Docs only. `npx vitest run tests/ai-filenames.test.ts tests/spec-images.test.ts`: 2 files, 6 tests passed (exit 0).

## Follow-ups

- The owner answers Q1–Q14 on the issue. The spec is then updated (status `ready`) and implemented in its own PR.
