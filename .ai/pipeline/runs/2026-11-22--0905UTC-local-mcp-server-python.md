# Local MCP server, Phases 2–4: the Python `cpg-mcp` server

**Date:** 2026-11-22 09:05 UTC
**Agent:** Claude Code (Opus 5.5), autonomous, `om-auto-fix-issue 393` → feature route → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-22--0818UTC-local-mcp-server.md`
**Issue:** #393 (this PR closes it). Stacked on #402 (Phase 1, the app side and `catalogue.json`).
**Status:** complete

## Goal

A local stdio MCP server, `mcp/` (`cpg-mcp`), that gives an agent CPG's whole API as 24 tools (34 for the admin). It reads the committed `catalogue.json`, calls the API with the user's token, and handles keys, generations, retries and errors for the agent. It ships with a CI `python` job at 100% coverage, `mcp/README.md` and `BACKWARD_COMPATIBILITY.md` §6.

## Scope

- `mcp/pyproject.toml`, `uv.lock`, `README.md`; `cpg_mcp/{__main__,config,client,catalogue,server,exclusions}.py`, `cpg_mcp/tools/` (context, reads, writes, admin); `mcp/tests/`.
- `.github/workflows/ci.yml` (`python` job), `tests/ci-workflow.test.ts`, `.gitignore`.
- `BACKWARD_COMPATIBILITY.md` §6; the spec moved to `implemented/` with implementation notes.

## Non-goals

- The onboarding skill and MCP prompt (#398). A remote/HTTP transport, OAuth, token creation (R07).
- Any change to a route, header, validator or message (D04); gaps go to new issues.
- Publishing to PyPI.

## Design decisions (within the spec)

- **One call path.** Every tool maps its arguments to one catalogue operation plus path parameters, query and body. The client validates the query and body against that operation's JSON Schema, then sends the request. A tool's input schema guides the model; the operation schema is what's checked locally, and the server stays the authority.
- **Patterns.** `jsonschema` validates `pattern` with the `regex` package, so the catalogue's `\p{L}`/`\p{N}` work (Phase 1 decision).
- **Save tools (A9), changed while building.** The Claude API refuses a top-level `oneOf`/`anyOf`/`allOf` in a tool's `input_schema`, so every tool's schema is one object. It holds the discriminators as enums and the union of the actions' fields; a field two actions shape differently becomes a property-level `anyOf`. Each action's required fields are in the description, and the chosen action's own operation schema is checked locally. A body that is a top-level `anyOf` with `null` (the MRP bodies) contributes its object branch.
- **Roles.** The server lists a tool when the role may call at least one of its actions, and offers only those actions (enum values / `oneOf` branches).
- **Retry (A4).** Reads and writes retry once on a connection error, a timeout or 502/503/504, and a write keeps its `Idempotency-Key`.
- **Integration (Q8 B).** No CI stdio test. The `respx` tests and in-process MCP client tests cover the behaviour, and a manual run against a local server is recorded on the PR (step 15).

## Implementation Plan

### Phase 2: Python skeleton and reads

5. `pyproject.toml`, `uv.lock`, `config.py`, `__main__.py`, with tests.
6. `client.py`: envelope, bearer, keys, generation cache and refresh, retry, replay flag, timeouts, error mapping.
7. `catalogue.py` (loading, argument validation) and `server.py` (role filter, help resources, startup exit on 401).
8. Context and read tools: `cpg_whoami`, `cpg_help`, `cpg_preferences`, `cpg_list`, `cpg_get`, `cpg_report`, `cpg_audit`.
9. CI `python` job, `tests/ci-workflow.test.ts`, `.gitignore`.

### Phase 3: writes

10. Planning tools and the document saves, with the version-conflict re-read.
11. Postings, stock import, lifecycle, reversals, `cpg_revoke_token`, and the Prod warning test.

### Phase 4: admin and parity

12. Admin tools, `cpg_import`, `cpg_users` (A8 text).
13. `exclusions.py` and the parity and role tests.
14. `mcp/README.md` and `BACKWARD_COMPATIBILITY.md` §6.
15. A manual run against a local server on Test: whoami, list materials, `cpg_mrp_run`, accept one proposal. Transcript on the PR.

## Risks

- The default base URL is production (Q6 B), and only the tool descriptions and the default tenant `test` guard Prod. A test pins the warning on every Prod-capable write tool.
- A second toolchain in CI: a red Python job blocks deploys (`deploy.yml` calls `ci.yml`).
- `mcp` 2.3 is a recent major; its low-level `Server` takes `on_*` handler arguments. A prototype run is in-process with `mcp.client.Client(server)`.

## Log

- 09:05 UTC: plan, draft PR #403, stacked on #402.
- A prototype confirmed `mcp` 2.3's API: `Server(on_list_tools=…, on_call_tool=…)`, and `mcp.client.Client(server)` in-process for tests.
- Coverage: a `# pragma: no cover` slipped into the first draft of `client._send`. It was replaced by a straight-line two-attempt structure, since AGENTS.md forbids coverage exclusions.
- `ruff` S105 flagged constants named `TOKEN_HINT`/`PASSWORD_NOTE` (false positives); they were renamed `ACCESS_HINT`/`CREDENTIAL_NOTE` rather than suppressed.
- The manual run (step 4.4) needed a token. The integration helpers import Vitest, so `agent-browser` was driven directly to create one on `/admin/tokens`.

## Review (om-auto-review-pr, independent subagent reviewer)

- No blockers. The reviewer probed all 103 tool, action and variant combinations against the catalogue, and each sent the right operation and path with nothing leaking into the body.
- One major, fixed: with the flat union schema, a field of another action got through. `cpg_save_material action=create active=false` sent `active`, which the lenient create schema drops; `q` outside `cpg_list`'s `query` listed everything.
  - Now `ActionTool.run` refuses any argument the chosen operation doesn't take ("Not accepted by action=create").
  - Every call is validated against the tool's advertised schema first, since `mcp` 2.3 validates input only on the HTTP transport.
- Minors fixed:
  - an action's "Never send: …" note and its optional fields are in the description;
  - a write that gets 502/503/504 twice is reported as possibly applied, with its key;
  - the client pauses 1 s before its one retry;
  - an object or array sent as a JSON string is decoded;
  - a merged field keeps its shared `type`;
  - the Codex snippet sets `startup_timeout_sec` and `tool_timeout_sec`;
  - a stale generation is forgotten (re-read by the next write) rather than refreshed inside the error path;
  - `CPG_BASE_URL` credentials are masked in the startup error;
  - `cpg_preferences` has annotations.
- New tests: 4xx never retried, write same-key retry after a 502, the stale generation's new value sent next, the stray-field cases, and a Prod-warning test that picks tools from the catalogue rather than from the built schema.
- Not changed: startup calls `/api/me` only (`cpg_whoami` reads `/api/tenants` when asked); the remaining nits are cosmetic.

## Progress

PR: #403

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 2: Python skeleton and reads

- [x] 2.1 Package, config and entry point — c9f77af9
- [x] 2.2 HTTP client — 537096a1
- [x] 2.3 Catalogue loader and MCP server — c34bb99f
- [x] 2.4 Context and read tools — d0b59178
- [x] 2.5 CI python job — 3f30d32b

### Phase 3: writes

- [x] 3.1 Planning tools and document saves — d0b59178
- [x] 3.2 Postings, lifecycle, reversals and token revoke — d0b59178

### Phase 4: admin and parity

- [x] 4.1 Admin tools, imports and users — d0b59178
- [x] 4.2 Exclusions, parity and role tests — d01109fd
- [x] 4.3 README and BACKWARD_COMPATIBILITY §6 — 9228506c, 58f785de
- [x] 4.4 Manual run against a local server — recorded in the spec notes and on the PR

## Verification

- Python: `uv run pytest --cov=cpg_mcp --cov-branch --cov-fail-under=100`, 110 passed at 100%; `ruff check`, `ruff format --check` and `pyright` (0 errors) are clean; `pip-audit --skip-editable` finds no known vulnerabilities.
- Node: `npm run lint`, `typecheck`, `test:coverage` (687 files, 100%) and `build` exit 0. The build needed one retry past Next.js's security notice.
- CI on ed9e2a74: all 12 checks pass, the new `python` job and the four integration shards included.
- Manual run over real stdio against a local standalone build: on the PR and in the spec's implementation notes.

## Follow-ups

- #398: the onboarding skill and MCP prompt, unblocked once #402 and this PR merge.
- Next.js moderate advisories (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8): already on `main`, left for the owner.
