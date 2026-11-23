# #398 acceptance run: an agent with only the skill and the MCP

**Date:** 2026-11-23 (UTC) · **Agent:** Codex CLI 0.164.0, `codex exec --ignore-user-config --sandbox read-only`, so no other MCP server or user config was loaded · **CPG:** a local standalone build of this branch on `127.0.0.1:3398`, with a fresh data directory, so the server's startup tiny Test dataset at generation 1 · **Server:** `uvx --from <branch>/mcp cpg-mcp`, admin token created on `/admin/tokens` · **Skill:** `.agents/skills/cpg-onboarding/SKILL.md` in the agent's otherwise empty working directory

**Why Codex:** headless Claude Code (`claude -p`) refused to start on this machine: "this login reached its time limit and cannot be renewed". `[mcp_servers.cpg] default_tools_approval_mode = "approve"` was set, because `codex exec` otherwise refuses every non-read-only MCP tool ("approval policy is never"). A first run without it stopped at `cpg_mrp_run`.

**Prompt:** "First load the cpg-onboarding skill and follow it. Then run today's planning loop on the Test tenant, end to end, as the skill describes … Finish with a short report to the planner that cites every record ID you read or changed. The planner is not available to answer questions during this run, so do not write to Prod."

## Tool calls (in order)

| # | Tool | Arguments | Result |
| --- | --- | --- | --- |
| 1 | shell (read-only sandbox) | `/bin/zsh -lc 'cat .agents/skills/cpg-onboarding/SKILL.md'` | exit 0 |
| 2 | `cpg_whoami` | `{}` | ok |
| 3 | `cpg_help` | `{"topic": "mrp"}` | ok |
| 4 | `cpg_help` | `{"topic": "demand-review"}` | ok |
| 5 | `cpg_report` | `{"kind": "demand-review", "tenant": "test"}` | ok |
| 6 | `cpg_report` | `{"kind": "demand-review", "tenant": "test"}` | ok |
| 7 | `cpg_mrp_run` | `{"mode": "manual", "tenant": "test"}` | ok |
| 8 | `cpg_report` | `{"kind": "mrp", "tenant": "test"}` | ok |
| 9 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 2, "run": "00000001", "generation": 1}}` | ok |
| 10 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 1, "run": "00000001", "generation": 1}}` | ok |
| 11 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 2, "run": "00000001", "generation": 1}}` | ok |
| 12 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 1, "run": "00000001", "generation": 1}}` | ok |
| 13 | `cpg_mrp_accept_proposal` | `{"tenant": "test", "run": "00000001", "proposal": "43d8c501-6f17-4cd9-ae2f-0e00cf3167d1"}` | ok |
| 14 | `cpg_report` | `{"kind": "stock", "tenant": "test"}` | ok |
| 15 | `cpg_list` | `{"entity": "purchase-orders", "tenant": "test"}` | ok |
| 16 | `cpg_report` | `{"kind": "variance", "tenant": "test"}` | ok |
| 17 | `cpg_list` | `{"entity": "production-orders", "tenant": "test"}` | ok |
| 18 | `cpg_list` | `{"entity": "shipments", "tenant": "test"}` | ok |
| 19 | `cpg_list` | `{"entity": "transfers", "tenant": "test"}` | ok |
| 20 | `cpg_list` | `{"entity": "purchase-requisitions", "tenant": "test"}` | ok |
| 21 | `cpg_report` | `{"kind": "variance", "tenant": "test", "query": {"page": 1}}` | ok |
| 22 | `cpg_report` | `{"kind": "variance", "tenant": "test", "query": {"page": 2}}` | ok |
| 23 | `cpg_report` | `{"kind": "variance", "tenant": "test", "query": {"page": 3}}` | ok |
| 24 | `cpg_list` | `{"entity": "purchase-orders", "tenant": "test"}` | ok |
| 25 | `cpg_list` | `{"entity": "production-orders", "tenant": "test"}` | ok |
| 26 | `cpg_list` | `{"entity": "shipments", "tenant": "test"}` | ok |
| 27 | `cpg_mrp_accept_proposal` | `{"tenant": "test", "run": "00000001", "proposal": "0499f1f2-491b-4744-bd0c-2fd49268ef8a"}` | ok |
| 28 | `cpg_mrp_accept_proposal` | `{"tenant": "test", "run": "00000001", "proposal": "c56a3670-4c41-43d9-8e58-5cb92c6c1087"}` | ok |
| 29 | `cpg_mrp_accept_proposal` | `{"tenant": "test", "run": "00000001", "proposal": "c49f38e9-f0c7-4d4e-96c5-07acfa286fd5"}` | ok |
| 30 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 2, "run": "00000001", "generation": 1}}` | ok |
| 31 | `cpg_report` | `{"kind": "mrp", "tenant": "test", "query": {"page": 1, "run": "00000001", "generation": 1}}` | ok |

What it got right, following the skill:
- It called `cpg_whoami` first and stated the account, role, default tenant and that both tenants were writable.
- It stayed on Test: every write passed `tenant: "test"`, and nothing touched Prod.
- It ran the loop in the skill's order: demand review, `cpg_mrp_run` (manual), the MRP report, acceptances, the document lists, stock, then variance.
- It accepted four on-time purchase proposals and said why it skipped the rest: `NO_FEASIBLE_BOM` provisional plans, late proposals that need a date decision, and large lots.
- It didn't post receipts or issues just because a planned date was today, since that doesn't prove goods moved.
- It cited every record by ID and tenant.
- No call was refused.

## The agent's final report (verbatim)

The Test planning loop is **partially complete**. Manual MRP run **00000001** created four purchase requisitions; the remaining proposals and document movements need further review. No Prod writes were made.

- **Demand:** In the current week, ordered quantities exceed shipments across the displayed products. No overdue quantity appeared in that week, and no products were excluded from statistical-unit totals. The review covered materials **00000005, 00000018–00000021 and 00000024–00000030**.
- **Accepted:** Requisitions **00000006** (20 l of material **00000023**, due December 4), **00000007** (30 kg of **00000014**, December 2), **00000008** (20 l of **00000008**, December 7), and **00000009** (500 kg of **00000001**, December 7) cover on-time proposed supply at location **00000001**.
- **Shortages:** MRP projected shortages beginning today for materials **00000002, 00000006, 00000010–00000013, 00000015–00000017 and 00000022** at location **00000001**. Open production orders **00000140, 00000142–00000143 and 00000145–00000148** have uncovered component requirements. For example, order **00000147** is short 35 boxes of material **00000006**, and order **00000148** is short 1.8 l of material **00000022**.
- **Exceptions and skipped proposals:** Numerous `NO_FEASIBLE_BOM` exceptions mean dependable components cannot support proposed production; the resulting provisional plans cannot be accepted. Late proposals need a date decision, and large lots need review. I left the other on-time proposals unaccepted pending review of their dependencies and the full horizon. No proposals were beyond the horizon.
- **Documents:** Purchase orders **00000023–00000025**, requisitions **00000001–00000005**, and shipments **00000116–00000119 and 00000121** were reviewed. Purchase order **00000024** has two lines planned for receipt today, and shipments **00000116–00000117** are planned for today. I did not post receipts or issues because the plans do not confirm physical arrival or dispatch. Requisitions **00000006–00000009** remain open.
- **Stock and variance:** All 30 material balances at location **00000001** were nonnegative. Production order **00000112** used 70.2 kg more of material **00000001** than planned; **00000035** used 64.8 kg more of the same material, and **00000063** used 57.6 kg more of material **00000007**. These are about 3% over their respective plans.

All IDs above refer to **Test**. The stock report covered materials **00000001–00000030**; the variance report covered production orders **00000001–00000136**. The MRP report remains the detailed source for the many later shortages and individual exceptions.
