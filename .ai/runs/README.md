# runs

Logs of **autonomous AI runs** — every run where an agent works without a human approving each step (dispatched tasks, scheduled/automated jobs, headless sessions) leaves exactly one log here.

- **Naming:** `YYYY-MM-DD-slug.md` — date the run started + short kebab-case slug, e.g. `2026-10-17-add-login-form.md`. Append `-2`, `-3`, … if the name is taken.
- The log is created at the start of the run and updated as it progresses, so an interrupted run still leaves a trail.
- It records the goal, the spec being implemented (if any), decisions and deviations, changes made, how they were verified, and follow-ups.

See [`AGENTS.md`](../../AGENTS.md) for the run log template.
