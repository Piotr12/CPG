# cpg-mcp

A local [MCP](https://modelcontextprotocol.io) server that gives an agent (Claude Code, Codex, Pi or any other MCP client) CPG's whole API as tools. It runs on your machine over stdio and calls CPG with an API token, so the agent can do what you can do through the API, with your account's rights, except reset the Test tenant.

Spec: [`.ai/specs/implemented/2026-11-22--0818UTC-local-mcp-server.md`](../.ai/specs/implemented/2026-11-22--0818UTC-local-mcp-server.md).

## 1. Create a token

Sign in to CPG, open **API tokens** in your account card (`/admin/tokens`), create a token named after the agent, for example `laptop agent`, and copy its secret: CPG shows it once. The agent acts as you, so its changes are audited under your account and that token's name. Revoke the token there to cut the agent off.

## 2. Add the server to your agent

You need [uv](https://docs.astral.sh/uv/). `uvx` fetches and runs the server; nothing else is installed.

**Claude Code**

```sh
claude mcp add cpg -e CPG_API_TOKEN=cpg_… -- uvx --from "git+https://github.com/Piotr12/CPG#subdirectory=mcp" cpg-mcp
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.cpg]
command = "uvx"
args = ["--from", "git+https://github.com/Piotr12/CPG#subdirectory=mcp", "cpg-mcp"]
env = { CPG_API_TOKEN = "cpg_…" }
# The first start fetches and builds the server, and an automatic MRP run can take a minute or two.
startup_timeout_sec = 60
tool_timeout_sec = 300
```

**Other MCP clients** (the common `mcpServers` JSON)

```json
{
  "mcpServers": {
    "cpg": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/Piotr12/CPG#subdirectory=mcp", "cpg-mcp"],
      "env": { "CPG_API_TOKEN": "cpg_…" }
    }
  }
}
```

From a checkout, use `uvx --from ./mcp cpg-mcp` instead.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CPG_API_TOKEN` | (required) | The token's secret. Never logged or shown. |
| `CPG_BASE_URL` | `https://cpg.baby` | The CPG to talk to, for example `http://localhost:3000` for `npm run dev`. |
| `CPG_TENANT` | `test` | The tenant every tool defaults to: `test` (the sandbox) or `prod`. |

The default address is production, so an unconfigured server works on real data. Only the default tenant keeps it on Test, and the tool descriptions ask the agent to confirm with you before writing to Prod. The server enforces nothing beyond what CPG itself does.

## What the agent gets

24 tools for a normal user and 34 for the admin. The server asks CPG who the token belongs to at startup and offers only the tools that account may use.

- **Context:** `cpg_whoami` (call it first), `cpg_help` (CPG's own help, also as `cpg://help/{topic}` resources), `cpg_preferences`.
- **Reads:** `cpg_list`, `cpg_get`, `cpg_report` (stock, variance, demand review, the latest MRP run), `cpg_audit`.
- **Planning:** `cpg_mrp_run`, `cpg_mrp_accept_proposal`.
- **Documents:** `cpg_save_customer_order`, `cpg_save_shipment`, `cpg_save_purchase_requisition`, `cpg_save_purchase_order`, `cpg_save_production_order`, `cpg_save_transfer` (`action=create` or `action=update`).
- **Postings:** `cpg_post_goods_issue`, `cpg_post_goods_receipt`, `cpg_post_production_completion`, `cpg_transfer_move`, `cpg_stock_correction`, `cpg_stock_import`.
- **Lifecycle:** `cpg_document_close` (cancel or close early), `cpg_reverse`, `cpg_revoke_token`.
- **Admin only:** `cpg_save_material`, `cpg_material_conversion`, `cpg_save_named_record` (locations, customers, suppliers), `cpg_save_planning_parameter`, `cpg_save_safety_stock_target`, `cpg_save_forecast`, `cpg_save_bom`, `cpg_import`, `cpg_set_read_only`, `cpg_users`.

Not offered: the Test reset, and the two `.xlsx` template downloads, which are for people. Tokens are created only in CPG's screens.

The server handles the API's write contract, so the agent doesn't have to:

- a fresh `Idempotency-Key` for every write;
- the tenant's `Dataset-Generation`;
- one retry with the same key after a dropped connection or a proxy error, so a write that landed is replayed (`"replayed": true`), never repeated;
- errors as `{ status, code, message, fieldErrors, params }`, with the record's current state attached to a version conflict.

Arguments are checked against the API's schemas before anything is sent, and CPG checks everything again.

## Development

```sh
cd mcp
uv sync
uv run pytest --cov=cpg_mcp --cov-branch   # 100% line and branch coverage, as CI requires
uv run ruff check . && uv run ruff format --check . && uv run pyright
uv run pip-audit --skip-editable
```

The tools read `cpg_mcp/catalogue.json`, which the app generates from its routes, validators and help topics. After changing any of them, run `npm run mcp:catalogue` at the repository root and commit the result; a Vitest check fails until you do. CI runs the `python` job in `.github/workflows/ci.yml` on every pull request.

Tool names, discriminator values and the variables above are a protected contract (`BACKWARD_COMPATIBILITY.md` §6).
