# om-prepare-test-env — CPG override

Extends the installed `om-prepare-test-env`. Everything not listed here applies unchanged.

## Entrypoint

`sh .ai/scripts/test-env-up.sh` (generated 2026-10-17; cold 63 s, warm 0 s reused, touched source → rebuild in 3 s with Docker's layer cache). Down: `sh .ai/scripts/test-env-down.sh`.

- **Mode:** docker. It builds the production `Dockerfile` of the checkout it runs in, the same image `tests/integration/` uses, and runs it as a `--rm` container on `127.0.0.1:3210` (or a free port). There are no backing services: SQLite lives inside the container, is fresh on every boot and is migrated at startup. Health is `GET /up` → `OK`.
- **Worktrees:** run the script *from* the checkout you want to test (`cd <worktree> && sh /path/to/main/.ai/scripts/test-env-up.sh`). It uses `git rev-parse --show-toplevel`, so an om-* worktree boots its own code. The container name is hashed from the checkout path, so checkouts never collide.
- **Browser:** agent-browser is the repo devDependency (`node_modules/.bin/agent-browser`). Worktrees have no `node_modules`, so the script falls back to the main checkout's copy. Run `npx agent-browser install` once per machine.
- **Credentials:** none; CPG has no auth yet. `test-env.env` holds only a placeholder comment.

## Lessons baked into the script

- 2026-10-17: om-* worktrees have no `node_modules`, so the first version reported `BROWSER_INSTALLED=0`. The browser lookup now also checks the main checkout.
- 2026-10-17: the reuse path didn't refresh the descriptor, so a stale `"installed": false` survived. Reuse now rewrites the `browser` entry.
