# Notify — 2026-10-24--0925UTC-design-system-v1

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-10-24T09:25:00Z — run started
- Brief: implement `.ai/specs/2026-10-24--0842UTC-design-system-v1.md` end to end as one PR against `main` (decision D8; Closes #203, Refs #204).
- Lead: Claude Code (claude-fable-5-1) in cezar task `eb7fb400`, branch `cez/eb7fb400`. Workers: cezar child tasks on claude-opus-5-5, forked from this branch's committed tip, one worktree each.
- Environment: Node v24.15.0, npm 11.12.1, gh 2.102.1 (Piotr12). Docker unavailable: integration files run against a local standalone server (lesson 2026-10-23). agent-browser is installed.
- Decision: this run folder is the run log; no separate `.ai/runs/` file (`.ai/skills/om-auto-create-pr-loop/SKILL.md`).

## 2026-10-24T09:40:00Z — W1 brief and scope decisions
- Decision: inside `packages/ui/src/components/**`, `badge.tsx` and `button.tsx` are W2's (the restyle); W1 touches them only for the focus ring (step 2) and the button hover/active tokens (step 4). Every other primitive is W1's in full, including its off-scale radius, spacing and font-size classes from the migration tables, because no other unit owns those files and the Close would otherwise find offenders without an owner.
- Decision: the scan's spacing rule covers padding, margin, gap and space-between utilities; sizes (`h- w- size- min-h- max-w-`) are not spacing. The Exceptions table's `16` path rule is implemented (flag `16` spacing outside home, Help and login).
- Decision: integration ports per worker, so parallel standalone servers never collide: lead 3100, W1 3101, W2 3102, W3 3103, P1 3111, P2 3112, P3 3113, P4 3114.
- Briefs are kept under `briefs/` in this folder; W1's is `briefs/w1-tokens-and-focus.md`.
