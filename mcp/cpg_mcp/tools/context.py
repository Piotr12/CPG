"""The context tier: who the agent acts as, CPG's own help, and the caller's preferences. An agent's first call."""

from collections.abc import Mapping
from typing import Any

import mcp_types as types

from cpg_mcp import __version__
from cpg_mcp.catalogue import LOCALES
from cpg_mcp.client import ApiError
from cpg_mcp.tools.base import Tool, ToolContext, execute, payload


class WhoAmI(Tool):
    name = "cpg_whoami"

    def operation_ids(self) -> frozenset[str]:
        return frozenset({"me.get", "tenants.list"})

    def definition(self, ctx: ToolContext) -> types.Tool:
        description = (
            "Who you act as in CPG: the account, its role (admin or user), the token's name, and both tenants with their"
            " dataset generation and read-only flag. Call it first. Test is the sandbox; Prod is real data."
        )
        schema = {"type": "object", "properties": {}, "additionalProperties": False}
        return types.Tool(
            name=self.name, description=description, input_schema=schema, annotations=types.ToolAnnotations(read_only_hint=True)
        )

    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        me = await execute(ctx, "me.get", {})
        tenants = await execute(ctx, "tenants.list", {})
        return {
            "account": me.data,
            "tenants": tenants.data,
            "defaultTenant": ctx.config.tenant,
            "baseUrl": ctx.config.base_url,
            "server": {"version": __version__, "catalogue": ctx.catalogue.generated_from},
        }


class Help(Tool):
    name = "cpg_help"

    def operation_ids(self) -> frozenset[str]:
        return frozenset()

    def definition(self, ctx: ToolContext) -> types.Tool:
        description = (
            "CPG's own help, the text its screens link to. Without a topic, the list of topics; with one, its text."
            " The same topics are resources at cpg://help/{topic}."
        )
        schema = {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "enum": list(ctx.catalogue.help["en"])},
                "locale": {"type": "string", "enum": list(LOCALES), "default": "en"},
            },
            "additionalProperties": False,
        }
        return types.Tool(
            name=self.name, description=description, input_schema=schema, annotations=types.ToolAnnotations(read_only_hint=True)
        )

    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        locale = str(args.get("locale") or "en")
        if locale not in LOCALES:
            raise ApiError(None, "VALIDATION_FAILED", "Unknown locale.", field_errors={"locale": [f"Choose one of: {', '.join(LOCALES)}."]})
        topics = ctx.catalogue.help[locale]
        topic = args.get("topic")
        if topic is None:
            return [{"id": entry.id, "title": entry.title} for entry in topics.values()]
        if topic not in topics:
            raise ApiError(None, "HELP_TOPIC_NOT_FOUND", f"No help topic {topic}. Call cpg_help without a topic for the list.")
        entry = topics[topic]
        return {"id": entry.id, "title": entry.title, "screen": entry.route, "body": list(entry.body)}


class Preferences(Tool):
    name = "cpg_preferences"

    def operation_ids(self) -> frozenset[str]:
        return frozenset({"preferences.get", "preferences.update"})

    def definition(self, ctx: ToolContext) -> types.Tool:
        body = ctx.catalogue.operation("preferences.update").body or {}
        description = "The caller's own language and theme. Without arguments it reads them; with either, it changes only what you send."
        schema = {"type": "object", "properties": dict(body.get("properties", {})), "additionalProperties": False}
        return types.Tool(name=self.name, description=description, input_schema=schema)

    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        changes = {name: value for name, value in args.items() if value is not None}
        if not changes:
            return payload(await execute(ctx, "preferences.get", {}))
        return payload(await execute(ctx, "preferences.update", {}, body=changes))
