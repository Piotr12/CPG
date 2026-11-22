# Local MCP server, Phases 2–4: the Python `cpg-mcp` server

**Date:** 2026-11-22 09:05 UTC
**Agent:** Claude Code (Opus 5.5), autonomous, `om-auto-fix-issue 393` → feature route → `om-auto-implement-spec` → `om-auto-create-pr`
**Source doc:** `.ai/specs/2026-11-22--0818UTC-local-mcp-server.md`
**Issue:** #393 (this PR closes it). Stacked on #402 (Phase 1, the app side and `catalogue.json`).
**Status:** in progress

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
- **Save tools (A9).** The input schema is `{"type": "object", "oneOf": [...]}` with one branch per allowed action, each branch carrying `action` as a `const`. A top-level `anyOf` with `null` (MRP bodies) is wrapped in an object.
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

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 2: Python skeleton and reads

- [ ] 2.1 Package, config and entry point
- [ ] 2.2 HTTP client
- [ ] 2.3 Catalogue loader and MCP server
- [ ] 2.4 Context and read tools
- [ ] 2.5 CI python job

### Phase 3: writes

- [ ] 3.1 Planning tools and document saves
- [ ] 3.2 Postings, lifecycle, reversals and token revoke

### Phase 4: admin and parity

- [ ] 4.1 Admin tools, imports and users
- [ ] 4.2 Exclusions, parity and role tests
- [ ] 4.3 README and BACKWARD_COMPATIBILITY §6
- [ ] 4.4 Manual run against a local server
