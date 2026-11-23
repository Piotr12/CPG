import json
from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from typing import Any

import anyio
import httpx
import mcp_types as types
import pytest
import respx
from mcp.client import Client

from cpg_mcp.catalogue import Catalogue
from cpg_mcp.client import CpgClient
from cpg_mcp.config import Config
from cpg_mcp.server import INSTRUCTIONS, CpgServer, StartupError, decoded_arguments, serve, start, without_credentials
from cpg_mcp.tools.base import Tool, ToolContext
from tests.conftest import ADMIN, TOKEN, USER, ok, refused

pytestmark = pytest.mark.anyio

Context = Callable[..., ToolContext]


def text_of(result: types.CallToolResult) -> Any:
    block = result.content[0]
    assert isinstance(block, types.TextContent)
    return json.loads(block.text)


class Exploding(Tool):
    name = "cpg_explode"

    def operation_ids(self) -> frozenset[str]:
        return frozenset()

    def definition(self, ctx: ToolContext) -> types.Tool:
        return types.Tool(name=self.name, input_schema={"type": "object"})

    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        raise RuntimeError(f"boom {args}")


async def test_lists_24_tools_for_a_user_and_34_for_the_admin(context: Context) -> None:
    async with Client(CpgServer(context(USER)).build()) as client:
        user = [tool.name for tool in (await client.list_tools()).tools]
    async with Client(CpgServer(context(ADMIN)).build()) as client:
        admin = [tool.name for tool in (await client.list_tools()).tools]

    assert (len(user), len(admin)) == (24, 34)
    assert user[0] == "cpg_whoami"
    assert "cpg_users" in admin
    assert "cpg_users" not in user


async def test_calls_a_tool_and_answers_compact_json(api: respx.MockRouter, context: Context) -> None:
    api.get("/api/tenants/test/materials/00000001").respond(json=ok({"id": "00000001", "description": "Żelazo"}))

    async with Client(CpgServer(context()).build()) as client:
        result = await client.call_tool("cpg_get", {"entity": "materials", "id": "00000001"})

    assert result.is_error is False
    block = result.content[0]
    assert isinstance(block, types.TextContent)
    assert block.text == '{"id":"00000001","description":"Żelazo"}'


async def test_answers_a_refusal_as_a_tool_error(api: respx.MockRouter, context: Context) -> None:
    api.get("/api/tenants/test/materials/00000099").respond(404, json=refused("MATERIAL_NOT_FOUND", "No such material."))

    async with Client(CpgServer(context()).build()) as client:
        result = await client.call_tool("cpg_get", {"entity": "materials", "id": "00000099"})

    assert result.is_error is True
    assert text_of(result) == {"status": 404, "code": "MATERIAL_NOT_FOUND", "message": "No such material."}


async def test_refuses_a_tool_the_role_is_not_offered(context: Context) -> None:
    async with Client(CpgServer(context(USER)).build()) as client:
        result = await client.call_tool("cpg_users", {"action": "create"})

    assert result.is_error is True
    assert text_of(result)["code"] == "UNKNOWN_TOOL"


async def test_hides_an_unexpected_failure_and_its_arguments(context: Context, capsys: pytest.CaptureFixture[str]) -> None:
    async with Client(CpgServer(context(), [Exploding()]).build()) as client:
        result = await client.call_tool("cpg_explode", {"password": "hunter2"})

    assert result.is_error is True
    assert text_of(result)["code"] == "INTERNAL_ERROR"
    logged = capsys.readouterr().err
    assert "cpg_explode failed with RuntimeError" in logged
    assert "hunter2" not in logged
    assert "hunter2" not in json.dumps(text_of(result))


async def test_serves_help_topics_as_resources(context: Context, catalogue: Catalogue) -> None:
    async with Client(CpgServer(context()).build()) as client:
        resources = (await client.list_resources()).resources
        mrp = await client.read_resource("cpg://help/mrp")

    assert len(resources) == len(catalogue.help["en"])
    assert {str(resource.uri) for resource in resources} >= {"cpg://help/mrp", "cpg://help/api-tokens"}
    content = mrp.contents[0]
    assert isinstance(content, types.TextResourceContents)
    assert content.text.startswith(f"# {catalogue.help['en']['mrp'].title}\n\n")


@pytest.mark.parametrize("uri", ["cpg://help/nope", "https://example.com/mrp"])
async def test_refuses_an_unknown_resource(context: Context, uri: str) -> None:
    server = CpgServer(context())

    with pytest.raises(ValueError, match="No such resource"):
        await server.read_resource(None, types.ReadResourceRequestParams(uri=uri))


async def test_tells_the_agent_to_start_with_whoami_and_stay_on_test(context: Context) -> None:
    async with Client(CpgServer(context()).build()) as client:
        assert client.instructions == INSTRUCTIONS
        assert client.server_info is not None
        assert client.server_info.name == "cpg"
    assert "Call cpg_whoami first" in INSTRUCTIONS


async def test_starts_with_the_callers_role(api: respx.MockRouter, config: Config) -> None:
    api.get("/api/me").respond(json=ok(USER))

    ctx = await start(config)

    assert ctx.role == "user"
    assert ctx.me == USER


async def test_will_not_start_on_a_bad_token_and_never_shows_it(api: respx.MockRouter, config: Config) -> None:
    api.get("/api/me").respond(401, json=refused("UNAUTHORIZED", "Invalid or revoked token."))

    with pytest.raises(StartupError) as raised:
        await start(config)

    message = str(raised.value)
    assert message.startswith("cpg-mcp can't start: Invalid or revoked token.")
    assert "(UNAUTHORIZED, CPG_BASE_URL=https://cpg.test)" in message
    assert TOKEN not in message


async def test_serves_over_the_given_streams_until_the_client_leaves(api: respx.MockRouter, config: Config) -> None:
    me = api.get("/api/me").respond(json=ok(USER))
    http = httpx.AsyncClient()
    client_to_server = anyio.create_memory_object_stream[Any](10)
    server_to_client = anyio.create_memory_object_stream[Any](10)

    @asynccontextmanager
    async def streams() -> AsyncIterator[tuple[Any, Any]]:
        yield client_to_server[1], server_to_client[0]

    client_to_server[0].close()
    await serve(config, streams, http)

    assert me.called
    assert http.is_closed


def test_a_context_defaults_to_a_user_when_me_has_no_role(catalogue: Catalogue, config: Config) -> None:
    ctx = ToolContext(client=CpgClient(config, retry_delay=0), catalogue=catalogue, config=config)

    assert ctx.role == "user"
    assert not ctx.allowed("users.list")


async def test_checks_arguments_against_the_tools_schema_before_running_it(api: respx.MockRouter, context: Context) -> None:
    async with Client(CpgServer(context()).build()) as client:
        result = await client.call_tool("cpg_get", {"entity": "materials", "id": "00000001", "tenant": "PROD"})

    assert result.is_error is True
    error = text_of(result)
    assert error["code"] == "VALIDATION_FAILED"
    assert list(error["fieldErrors"]) == ["tenant"]
    assert not api.calls


async def test_decodes_an_object_a_client_sent_as_a_json_string(api: respx.MockRouter, context: Context) -> None:
    route = api.get("/api/tenants/test/materials").respond(json=ok([]))

    async with Client(CpgServer(context()).build()) as client:
        result = await client.call_tool("cpg_list", {"entity": "materials", "query": '{"q": "steel"}'})

    assert result.is_error is False
    assert route.calls.last.request.url.params["q"] == "steel"


def test_leaves_a_string_that_is_not_json_for_the_schema_to_refuse() -> None:
    schema = {"type": "object", "properties": {"query": {"type": "object"}, "id": {"type": "string"}}}

    assert decoded_arguments(schema, {"query": "q=steel", "id": "[1]"}) == {"query": "q=steel", "id": "[1]"}
    assert decoded_arguments(schema, {"query": "{}", "other": "{}"}) == {"query": {}, "other": "{}"}


def test_prints_a_base_url_without_its_credentials() -> None:
    assert without_credentials("https://user:secret@cpg.example:8443/x") == "https://cpg.example:8443/x"
    assert without_credentials("https://cpg.baby") == "https://cpg.baby"
    assert without_credentials("http://") == "http://"


async def test_never_prints_credentials_in_the_base_url(api: respx.MockRouter, config: Config) -> None:
    with respx.mock(assert_all_called=False) as router:
        router.get("https://cpg.test/api/me").respond(401, json=refused("UNAUTHORIZED", "Invalid or revoked token."))
        with pytest.raises(StartupError) as raised:
            await start(Config(base_url="https://user:pa55@cpg.test", token=TOKEN, tenant="test"))

    assert "pa55" not in str(raised.value)
    assert "CPG_BASE_URL=https://cpg.test)" in str(raised.value)
