# runs

Logs of **autonomous AI runs** — every run where an agent works without a human approving each step (dispatched tasks, scheduled/automated jobs, headless sessions) leaves exactly one log here — except runs driven by an om-* skill that writes an execution plan (`om-auto-create-pr`, `om-auto-create-pr-loop`, `om-auto-continue-pr`), whose plan in [`../pipeline/runs/`](../pipeline/runs/) is the run log.

- **Naming:** `YYYY-MM-DD--HHMMUTC-slug.md` — date and 24-hour UTC time the run started + short kebab-case slug, e.g. `2026-10-17--1432UTC-add-login-form.md`. Append `-2`, `-3`, … if the name is taken.
- The log is created at the start of the run and updated as it progresses, so an interrupted run still leaves a trail.
- It records the goal, the spec being implemented (if any), decisions and deviations, changes made, how they were verified, and follow-ups.

See [`AGENTS.md`](../../AGENTS.md) for the run log template.
