"""The MCP server: the tools the caller's role may use, CPG's help topics as resources, and the onboarding prompt."""

import json
import sys
from collections.abc import Mapping
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx
import mcp_types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

from cpg_mcp import __version__
from cpg_mcp.catalogue import Catalogue, load_catalogue, validation_errors
from cpg_mcp.client import ApiError, CpgClient
from cpg_mcp.config import Config
from cpg_mcp.onboarding import PROMPT_NAME, Skill, load_skill
from cpg_mcp.tools import all_tools
from cpg_mcp.tools.base import LOCAL_VALIDATION_MESSAGE, Tool, ToolContext, compact, execute

HELP_URI = "cpg://help/"
INSTRUCTIONS = (
    "CPG is an MRP II planning tool. Call cpg_whoami first. Every tenant tool defaults to the Test tenant, the sandbox;"
    " Prod holds real data, so ask the human before writing there. cpg_help explains each screen and rule."
    " Load the prompt cpg_onboarding to learn how a planner works in CPG."
)


class StartupError(Exception):
    """The server can't start: the message is for the human, and never holds the token."""


class Streams(Protocol):
    def __call__(self) -> AbstractAsyncContextManager[tuple[Any, Any]]: ...


def tool_result(data: Any, *, is_error: bool = False) -> types.CallToolResult:
    return types.CallToolResult(content=[types.TextContent(type="text", text=compact(data))], is_error=is_error)


def decoded_arguments(schema: Mapping[str, Any], arguments: Mapping[str, Any]) -> dict[str, Any]:
    """The arguments, with an object or array a client sent as a JSON string decoded (some clients stringify them)."""
    properties = schema.get("properties", {})
    decoded = dict(arguments)
    for name, value in arguments.items():
        expected = properties.get(name, {}).get("type")
        if isinstance(value, str) and expected in ("object", "array"):
            try:
                decoded[name] = json.loads(value)
            except ValueError:
                continue
    return decoded


def without_credentials(url: str) -> str:
    """A URL fit to print: any user name or password in it removed."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(netloc=parts.hostname + (f":{parts.port}" if parts.port else ""))) if parts.hostname else url


class CpgServer:
    def __init__(self, ctx: ToolContext, tools: list[Tool] | None = None, skill: Skill | None = None) -> None:
        self.ctx = ctx
        self.skill = skill or load_skill()
        self.definitions: dict[str, types.Tool] = {}
        self.tools: dict[str, Tool] = {}
        for tool in tools if tools is not None else all_tools():
            definition = tool.definition(ctx)
            if definition is not None:
                self.definitions[tool.name] = definition
                self.tools[tool.name] = tool

    def build(self) -> Server[Any]:
        return Server(
            "cpg",
            version=__version__,
            title="CPG",
            instructions=INSTRUCTIONS,
            on_list_tools=self.list_tools,
            on_call_tool=self.call_tool,
            on_list_resources=self.list_resources,
            on_read_resource=self.read_resource,
            on_list_prompts=self.list_prompts,
            on_get_prompt=self.get_prompt,
        )

    async def list_tools(self, _ctx: Any, _params: Any) -> types.ListToolsResult:
        return types.ListToolsResult(tools=list(self.definitions.values()))

    async def call_tool(self, _ctx: Any, params: types.CallToolRequestParams) -> types.CallToolResult:
        tool = self.tools.get(params.name)
        if tool is None:
            return tool_result({"code": "UNKNOWN_TOOL", "message": f"There is no tool {params.name} for this account."}, is_error=True)
        schema = self.definitions[params.name].input_schema
        args = decoded_arguments(schema, params.arguments or {})
        errors = validation_errors(schema, args)
        if errors:
            return tool_result({"code": "VALIDATION_FAILED", "message": LOCAL_VALIDATION_MESSAGE, "fieldErrors": errors}, is_error=True)
        try:
            return tool_result(await tool.run(args, self.ctx))
        except ApiError as error:
            return tool_result(error.as_json(), is_error=True)
        except Exception as error:
            # Never the arguments: they may hold a password (A8).
            print(f"cpg-mcp: {params.name} failed with {type(error).__name__}", file=sys.stderr)
            return tool_result(
                {"code": "INTERNAL_ERROR", "message": "cpg-mcp failed unexpectedly; the request may not have been sent."}, is_error=True
            )

    async def list_resources(self, _ctx: Any, _params: Any) -> types.ListResourcesResult:
        topics = self.ctx.catalogue.help["en"].values()
        return types.ListResourcesResult(
            resources=[
                types.Resource(uri=f"{HELP_URI}{topic.id}", name=topic.id, title=topic.title, mime_type="text/markdown") for topic in topics
            ]
        )

    async def read_resource(self, _ctx: Any, params: types.ReadResourceRequestParams) -> types.ReadResourceResult:
        uri = str(params.uri)
        topic = self.ctx.catalogue.help["en"].get(uri.removeprefix(HELP_URI)) if uri.startswith(HELP_URI) else None
        if topic is None:
            raise ValueError(f"No such resource: {uri}")
        return types.ReadResourceResult(contents=[types.TextResourceContents(uri=uri, text=topic.as_markdown(), mime_type="text/markdown")])

    async def list_prompts(self, _ctx: Any, _params: Any) -> types.ListPromptsResult:
        return types.ListPromptsResult(prompts=[types.Prompt(name=PROMPT_NAME, title="CPG onboarding", description=self.skill.description)])

    async def get_prompt(self, _ctx: Any, params: types.GetPromptRequestParams) -> types.GetPromptResult:
        if params.name != PROMPT_NAME:
            raise ValueError(f"No such prompt: {params.name}")
        message = types.PromptMessage(role="user", content=types.TextContent(type="text", text=self.skill.body))
        return types.GetPromptResult(description=self.skill.description, messages=[message])


async def start(config: Config, http: httpx.AsyncClient | None = None, catalogue: Catalogue | None = None) -> ToolContext:
    """Connects to CPG and learns the caller's role (`GET /api/me`), so only that role's tools are offered."""
    ctx = ToolContext(client=CpgClient(config, http), catalogue=catalogue or load_catalogue(), config=config)
    try:
        ctx.me = (await execute(ctx, "me.get", {})).data
    except ApiError as error:
        await ctx.client.aclose()
        raise StartupError(
            f"cpg-mcp can't start: {error.message} ({error.code}, CPG_BASE_URL={without_credentials(config.base_url)})."
        ) from None
    return ctx


async def serve(config: Config, streams: Streams = stdio_server, http: httpx.AsyncClient | None = None) -> None:
    """Runs the server over stdio until the client disconnects."""
    ctx = await start(config, http)
    server = CpgServer(ctx).build()
    try:
        async with streams() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())
    finally:
        await ctx.client.aclose()
