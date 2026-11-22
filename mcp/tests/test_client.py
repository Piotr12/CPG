import uuid

import httpx
import pytest
import respx

from cpg_mcp import __version__
from cpg_mcp.catalogue import Catalogue
from cpg_mcp.client import ACCESS_HINT, STALE_HINT, ApiError, CpgClient, build_path, encode_query
from cpg_mcp.config import Config
from tests.conftest import TOKEN, ok, refused

pytestmark = pytest.mark.anyio

CREATED = {"id": "00000001", "version": 1}


def test_fills_and_escapes_path_parameters(catalogue: Catalogue) -> None:
    operation = catalogue.operation("material-conversions.update")

    assert (
        build_path(operation, {"tenant": "test", "id": "00000001", "unit": "m²/x"})
        == "/api/tenants/test/materials/00000001/conversions/m%C2%B2%2Fx"
    )
    with pytest.raises(ApiError) as raised:
        build_path(operation, {"tenant": "test", "id": "00000001"})
    assert raised.value.field_errors == {"unit": ["unit is required."]}


def test_encodes_a_query_as_the_api_reads_it() -> None:
    query = {"material": ["00000001", "00000002"], "includeZero": True, "zero": False, "page": 2, "q": None}

    assert encode_query(query) == [
        ("material", "00000001"),
        ("material", "00000002"),
        ("includeZero", "true"),
        ("zero", "false"),
        ("page", "2"),
    ]
    assert encode_query(None) == []


async def test_reads_with_the_bearer_and_no_write_headers(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    route = api.get("/api/tenants/test/materials").respond(json=ok({"items": [], "page": 1}))

    result = await CpgClient(config).call(catalogue.operation("materials.list"), {"tenant": "test"}, {"q": "steel", "page": 1})

    assert result.data == {"items": [], "page": 1}
    assert result.replayed is False
    request = route.calls.last.request
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert request.headers["user-agent"] == f"cpg-mcp/{__version__}"
    assert "idempotency-key" not in request.headers
    assert "dataset-generation" not in request.headers
    assert request.url.params.multi_items() == [("q", "steel"), ("page", "1")]


async def test_sends_a_fresh_key_and_the_cached_generation_on_tenant_writes(
    api: respx.MockRouter, catalogue: Catalogue, config: Config
) -> None:
    route = api.post("/api/tenants/test/materials").respond(json=ok(CREATED))
    client = CpgClient(config)
    operation = catalogue.operation("materials.create")

    await client.call(operation, {"tenant": "test"}, body={"type": "raw", "description": "Steel", "baseUnit": "kg"})
    await client.call(operation, {"tenant": "test"}, body={"type": "raw", "description": "Tin", "baseUnit": "kg"})

    first, second = (call.request for call in route.calls)
    assert first.headers["dataset-generation"] == second.headers["dataset-generation"] == "7"
    assert first.headers["idempotency-key"] != second.headers["idempotency-key"]
    uuid.UUID(first.headers["idempotency-key"], version=4)
    assert api.routes[0].call_count == 1  # the generation was read once
    assert first.read() == b'{"type":"raw","description":"Steel","baseUnit":"kg"}'


async def test_sends_no_generation_on_a_global_write(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    route = api.patch("/api/tenants/prod").respond(json=ok({"code": "prod", "readOnly": True}))

    await CpgClient(config).call(catalogue.operation("tenants.set-read-only"), {"tenant": "prod"}, body={"readOnly": True})

    assert "dataset-generation" not in route.calls.last.request.headers
    assert "idempotency-key" in route.calls.last.request.headers


async def test_retries_a_dropped_write_once_with_the_same_key_and_reports_the_replay(
    api: respx.MockRouter, catalogue: Catalogue, config: Config
) -> None:
    route = api.post("/api/tenants/test/mrp/runs").mock(
        side_effect=[httpx.ConnectError("reset"), httpx.Response(200, json=ok({"id": "00000003"}), headers={"Idempotent-Replayed": "true"})]
    )

    result = await CpgClient(config).call(catalogue.operation("mrp.runs.create"), {"tenant": "test"}, body={})

    assert result.replayed is True
    assert result.data == {"id": "00000003"}
    keys = {call.request.headers["idempotency-key"] for call in route.calls}
    assert route.call_count == 2
    assert len(keys) == 1


@pytest.mark.parametrize("status", [502, 503, 504])
async def test_retries_a_proxy_error_once(api: respx.MockRouter, catalogue: Catalogue, config: Config, status: int) -> None:
    route = api.get("/api/tenants").mock(side_effect=[httpx.Response(status), httpx.Response(200, json=ok([]))])

    assert (await CpgClient(config).call(catalogue.operation("tenants.list"))).data == []
    assert route.call_count == 2


async def test_never_retries_a_500_which_may_have_partly_run(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    route = api.post("/api/tenants/test/mrp/runs").respond(500, json=refused("INTERNAL_ERROR", "Something went wrong."))

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("mrp.runs.create"), {"tenant": "test"}, body={})

    assert route.call_count == 1
    assert raised.value.as_json() == {"status": 500, "code": "INTERNAL_ERROR", "message": "Something went wrong."}


async def test_answers_the_second_proxy_error_as_it_is(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    api.get("/api/tenants").respond(503, text="Service Unavailable")

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("tenants.list"))

    assert (raised.value.status, raised.value.code) == (503, "UNEXPECTED_RESPONSE")


async def test_names_the_key_when_a_write_fails_twice(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    route = api.post("/api/tenants/test/mrp/runs").mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("mrp.runs.create"), {"tenant": "test"}, body={})

    error = raised.value.as_json()
    assert error["code"] == "CONNECTION_FAILED"
    assert "timed out, twice, so it may or may not have been applied" in error["message"]
    assert error["idempotencyKey"] == route.calls.last.request.headers["idempotency-key"]


async def test_says_a_read_could_not_reach_cpg(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    api.get("/api/me").mock(side_effect=httpx.ConnectError("refused"))

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("me.get"))

    assert raised.value.code == "CONNECTION_FAILED"
    assert raised.value.message.startswith("The request could not reach CPG, twice.")
    assert "idempotencyKey" not in raised.value.as_json()


async def test_passes_a_refusal_through_with_its_fields_and_params(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    body = refused("TENANT_READ_ONLY", "This tenant is read-only.", fieldErrors={"lines.0.unit": ["Bad."]}, params={"tenant": "prod"})
    api.post("/api/tenants/prod/stock/corrections").respond(409, json=body)

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("stock.correct"), {"tenant": "prod"}, body={})

    assert raised.value.as_json() == {
        "status": 409,
        "code": "TENANT_READ_ONLY",
        "message": "This tenant is read-only.",
        "fieldErrors": {"lines.0.unit": ["Bad."]},
        "params": {"tenant": "prod"},
    }
    assert str(raised.value) == "TENANT_READ_ONLY: This tenant is read-only."


async def test_tells_the_human_to_replace_a_revoked_token(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    api.get("/api/me").respond(401, json=refused("UNAUTHORIZED", "Invalid or revoked token."))

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("me.get"))

    assert raised.value.message == f"Invalid or revoked token. {ACCESS_HINT}"
    assert TOKEN not in raised.value.message


async def test_maps_an_error_without_details(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    api.get("/api/me").respond(400, json={"ok": False})

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("me.get"))

    assert raised.value.as_json() == {"status": 400, "code": "UNKNOWN", "message": ""}


async def test_refuses_an_answer_that_is_not_the_envelope(api: respx.MockRouter, catalogue: Catalogue, config: Config) -> None:
    api.get("/api/me").respond(200, json=[1, 2])

    with pytest.raises(ApiError) as raised:
        await CpgClient(config).call(catalogue.operation("me.get"))

    assert raised.value.code == "UNEXPECTED_RESPONSE"


async def test_refreshes_a_stale_generation_and_says_test_was_reset_without_retrying(
    api: respx.MockRouter, catalogue: Catalogue, config: Config
) -> None:
    write = api.post("/api/tenants/test/mrp/runs").respond(409, json=refused("GENERATION_STALE", "The Test tenant was reset."))
    client = CpgClient(config)

    with pytest.raises(ApiError) as raised:
        await client.call(catalogue.operation("mrp.runs.create"), {"tenant": "test"}, body={})

    assert write.call_count == 1
    assert raised.value.message == f"The Test tenant was reset. {STALE_HINT}"
    assert api.routes[0].call_count == 2  # read before the write, refreshed after it
    assert await client.generation("test") == 7


async def test_closes_its_http_client(config: Config) -> None:
    http = httpx.AsyncClient()
    await CpgClient(config, http).aclose()

    assert http.is_closed
