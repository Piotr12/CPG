import base64
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import respx

from cpg_mcp import __version__
from cpg_mcp.client import ApiError
from cpg_mcp.tools import all_tools
from cpg_mcp.tools.base import PROD_WARNING, Action, ActionTool, Tool, ToolContext, _merge, _object_schema
from tests.conftest import ADMIN, BASE_URL, USER, ok, refused

pytestmark = pytest.mark.anyio

Context = Callable[..., ToolContext]
PREVIEW = "a" * 64


def tool(name: str) -> Tool:
    return next(candidate for candidate in all_tools() if candidate.name == name)


def action_tool(name: str) -> ActionTool:
    found = tool(name)
    assert isinstance(found, ActionTool)
    return found


def sent(route: respx.Route) -> Any:
    return json.loads(route.calls.last.request.read() or b"null")


# The definition a role sees


def test_offers_a_role_only_the_actions_it_may_call(context: Context) -> None:
    admin = action_tool("cpg_list").definition(context(ADMIN))
    user = action_tool("cpg_list").definition(context(USER))
    assert admin is not None
    assert user is not None

    assert "users" in admin.input_schema["properties"]["entity"]["enum"]
    assert "users" not in user.input_schema["properties"]["entity"]["enum"]
    assert "tokens" in user.input_schema["properties"]["entity"]["enum"]
    assert action_tool("cpg_save_material").definition(context(USER)) is None


def test_describes_each_action_with_its_required_fields_and_the_prod_warning(context: Context) -> None:
    definition = action_tool("cpg_save_customer_order").definition(context())
    assert definition is not None
    description = definition.description or ""

    assert "- action=create: Enters a customer order" in description
    assert "Requires: id, version, customer, location, lines." in description
    assert description.endswith(PROD_WARNING)
    schema = definition.input_schema
    assert schema["type"] == "object"
    assert schema["required"] == ["action"]
    assert schema["properties"]["action"]["enum"] == ["create", "update"]
    assert schema["properties"]["tenant"]["default"] == "test"
    assert "oneOf" not in schema
    assert definition.annotations is not None
    assert definition.annotations.read_only_hint is False


def test_joins_a_field_two_actions_define_differently(context: Context) -> None:
    definition = action_tool("cpg_save_customer_order").definition(context())
    assert definition is not None

    assert "anyOf" in definition.input_schema["properties"]["lines"]


def test_merges_fields_into_one_union() -> None:
    properties: dict[str, Any] = {}
    _merge(properties, "a", {"type": "string"})
    _merge(properties, "a", {"type": "string"})
    assert properties["a"] == {"type": "string"}
    _merge(properties, "a", {"type": "integer"})
    _merge(properties, "a", {"type": "integer"})
    _merge(properties, "a", {"type": "boolean"})
    assert properties["a"] == {"anyOf": [{"type": "string"}, {"type": "integer"}, {"type": "boolean"}]}


def test_finds_the_object_form_of_a_body() -> None:
    assert _object_schema(None) == {}
    assert _object_schema({"type": "object", "properties": {}}) == {"type": "object", "properties": {}}
    assert _object_schema({"anyOf": [{"type": "null"}, {"type": "object", "x": 1}]}) == {"type": "object", "x": 1}
    assert _object_schema({"anyOf": [{"type": "null"}]}) == {}


def test_marks_reads_read_only_and_lists_a_free_query_object(context: Context) -> None:
    definition = action_tool("cpg_report").definition(context())
    assert definition is not None

    assert definition.annotations is not None
    assert definition.annotations.read_only_hint is True
    assert definition.input_schema["properties"]["query"]["type"] == "object"
    assert PROD_WARNING not in (definition.description or "")


def test_offers_a_file_path_instead_of_the_encoded_workbook(context: Context) -> None:
    definition = action_tool("cpg_stock_import").definition(context())
    assert definition is not None
    properties = definition.input_schema["properties"]

    assert "file_path" in properties
    assert "workbook" not in properties
    assert "Requires: file_path." in (definition.description or "")


def test_offers_a_tool_without_discriminators_as_its_operation(context: Context) -> None:
    definition = action_tool("cpg_mrp_accept_proposal").definition(context())
    assert definition is not None

    assert "required" not in definition.input_schema
    assert set(definition.input_schema["properties"]) == {"tenant", "run", "proposal"}
    assert "- Accepts one proposal" in (definition.description or "")


def test_gives_a_field_two_actions_type_alike_their_shared_type() -> None:
    properties: dict[str, Any] = {}
    _merge(properties, "lines", {"type": "array", "maxItems": 2})
    _merge(properties, "lines", {"type": "array", "maxItems": 3})
    _merge(properties, "lines", {"type": "array", "maxItems": 4})

    assert properties["lines"] == {"type": "array", "anyOf": [{"type": "array", "maxItems": n} for n in (2, 3, 4)]}


def test_lists_each_actions_optional_fields_and_what_it_never_takes(context: Context) -> None:
    definition = action_tool("cpg_save_purchase_requisition").definition(context())
    assert definition is not None
    update = next(line for line in (definition.description or "").splitlines() if line.startswith("- action=update"))

    assert "Requires: id, version, requiredDate." in update
    assert "Never send: material, location, quantity, unit." in update
    create = next(line for line in (definition.description or "").splitlines() if line.startswith("- action=create"))
    assert "Optional:" not in create or "Never send" not in create


def test_names_a_lists_optional_query(context: Context) -> None:
    definition = action_tool("cpg_list").definition(context())
    assert definition is not None

    assert "- entity=materials: Lists the tenant's materials, narrowed by q and sorted by sort/dir. Optional: query." in (
        definition.description or ""
    )


# Running a tool


async def test_lists_with_the_query_object_and_the_default_tenant(api: respx.MockRouter, context: Context) -> None:
    route = api.get("/api/tenants/test/materials").respond(json=ok({"items": [{"id": "00000001"}], "page": 1}))

    result = await action_tool("cpg_list").run({"entity": "materials", "query": {"q": "steel"}}, context())

    assert result == {"items": [{"id": "00000001"}], "page": 1}
    assert route.calls.last.request.url.params["q"] == "steel"


async def test_lists_a_production_orders_completions_by_parent(api: respx.MockRouter, context: Context) -> None:
    route = api.get("/api/tenants/prod/production-orders/00000004/completions").respond(json=ok({"items": []}))

    await action_tool("cpg_list").run({"entity": "production-completions", "parent": "00000004", "tenant": "prod"}, context())

    assert route.called


async def test_checks_a_query_locally_before_sending_it(api: respx.MockRouter, context: Context) -> None:
    route = api.get("/api/tenants/test/reports/stock")

    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_report").run({"kind": "stock", "query": {"material": "12"}}, context())

    assert not route.called
    assert raised.value.code == "VALIDATION_FAILED"
    assert raised.value.field_errors is not None
    assert "material" in raised.value.field_errors
    assert raised.value.extra == {"operation": "reports.stock"}


async def test_reads_a_bom_revision_when_one_is_asked_for(api: respx.MockRouter, context: Context) -> None:
    current = api.get("/api/tenants/test/boms/00000002").respond(json=ok({"revision": 3}))
    older = api.get("/api/tenants/test/boms/00000002/revisions/1").respond(json=ok({"revision": 1}))
    get = action_tool("cpg_get")

    assert await get.run({"entity": "boms", "id": "00000002"}, context()) == {"revision": 3}
    assert await get.run({"entity": "boms", "id": "00000002", "revision": "1"}, context()) == {"revision": 1}
    assert current.call_count == older.call_count == 1


async def test_refuses_a_choice_the_role_may_not_make(api: respx.MockRouter, context: Context) -> None:
    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_list").run({"entity": "users"}, context(USER))

    assert raised.value.field_errors is not None
    assert raised.value.field_errors["entity"][0].startswith("Choose one of: entity=materials")
    assert not api.calls


async def test_sends_the_rest_of_the_arguments_as_the_body(api: respx.MockRouter, context: Context) -> None:
    route = api.post("/api/tenants/test/purchase-requisitions").respond(json=ok({"id": "00000009"}))
    args = {"action": "create", "material": "00000001", "location": "00000001", "quantity": "5", "unit": "kg", "requiredDate": "2026-12-01"}

    assert await action_tool("cpg_save_purchase_requisition").run(args, context()) == {"id": "00000009"}

    assert sent(route) == {"material": "00000001", "location": "00000001", "quantity": "5", "unit": "kg", "requiredDate": "2026-12-01"}


async def test_reports_a_replayed_write(api: respx.MockRouter, context: Context) -> None:
    api.post("/api/tenants/test/mrp/runs").respond(json=ok({"id": "00000002"}), headers={"Idempotent-Replayed": "true"})

    assert await action_tool("cpg_mrp_run").run({"mode": "manual"}, context()) == {"replayed": True, "data": {"id": "00000002"}}


async def test_attaches_the_current_record_to_a_version_conflict(api: respx.MockRouter, context: Context) -> None:
    api.patch("/api/tenants/test/purchase-requisitions/00000009").respond(409, json=refused("VERSION_CONFLICT", "Someone changed it."))
    api.get("/api/tenants/test/purchase-requisitions/00000009").respond(json=ok({"id": "00000009", "version": 4}))

    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_save_purchase_requisition").run(
            {"action": "update", "id": "00000009", "version": 3, "requiredDate": "2026-12-02"}, context()
        )

    assert raised.value.as_json()["current"] == {"id": "00000009", "version": 4}
    assert raised.value.message.endswith("re-plan from it.")


async def test_still_reports_a_conflict_when_the_re_read_fails(api: respx.MockRouter, context: Context) -> None:
    api.patch("/api/tenants/test/purchase-requisitions/00000009").respond(409, json=refused("VERSION_CONFLICT", "Someone changed it."))
    api.get("/api/tenants/test/purchase-requisitions/00000009").respond(404, json=refused("PURCHASE_REQUISITION_NOT_FOUND"))

    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_save_purchase_requisition").run(
            {"action": "update", "id": "00000009", "version": 3, "requiredDate": "2026-12-02"}, context()
        )

    assert raised.value.code == "VERSION_CONFLICT"
    assert "current" not in raised.value.extra


async def test_passes_other_refusals_through_untouched(api: respx.MockRouter, context: Context) -> None:
    api.post("/api/tenants/prod/stock/corrections").respond(409, json=refused("TENANT_READ_ONLY", "This tenant is read-only."))
    args = {"tenant": "prod", "material": "00000001", "location": "00000001", "quantity": "-1", "unit": "kg", "reason": "Count"}

    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_stock_correction").run(args, context())

    assert raised.value.code == "TENANT_READ_ONLY"


async def test_maps_a_renamed_path_argument(api: respx.MockRouter, context: Context) -> None:
    route = api.delete("/api/tenants/test/materials/00000001/conversions/case").respond(json=ok({"id": "00000001"}))

    await action_tool("cpg_material_conversion").run({"action": "remove", "material": "00000001", "unit": "case", "version": 2}, context())

    assert sent(route) == {"version": 2}


async def test_closes_a_document_by_kind_and_action(api: respx.MockRouter, context: Context) -> None:
    route = api.post("/api/tenants/test/customer-orders/00000003/close-early").respond(json=ok({"status": "closed-early"}))

    await action_tool("cpg_document_close").run(
        {"kind": "customer-order", "action": "close-early", "id": "00000003", "version": 5}, context()
    )

    assert sent(route) == {"version": 5}


async def test_reverses_a_production_completion(api: respx.MockRouter, context: Context) -> None:
    route = api.post("/api/tenants/test/production-orders/00000004/completions/00000002/reverse").respond(json=ok({}))

    await action_tool("cpg_reverse").run(
        {"kind": "production-completion", "id": "00000004", "completionId": "00000002", "reason": "Wrong"}, context()
    )

    assert sent(route) == {"reason": "Wrong"}


async def test_previews_a_completion_as_a_read(api: respx.MockRouter, context: Context) -> None:
    route = api.get("/api/tenants/test/production-orders/00000004/completions/preview").respond(json=ok({"components": []}))

    await action_tool("cpg_post_production_completion").run(
        {"action": "preview", "id": "00000004", "quantity": "2", "unit": "each"}, context()
    )

    assert route.calls.last.request.url.params.multi_items() == [("quantity", "2"), ("unit", "each")]
    assert "idempotency-key" not in route.calls.last.request.headers


async def test_accepts_a_proposal_with_an_empty_body(api: respx.MockRouter, context: Context) -> None:
    route = api.post("/api/tenants/test/mrp/runs/00000001/proposals/00000002/accept").respond(json=ok({"document": "00000010"}))

    await action_tool("cpg_mrp_accept_proposal").run({"run": "00000001", "proposal": "00000002"}, context())

    assert sent(route) == {}


async def test_revokes_a_token_without_a_body_or_a_tenant(api: respx.MockRouter, context: Context) -> None:
    route = api.delete("/api/tokens/t9").respond(json=ok({"id": "t9"}))

    await action_tool("cpg_revoke_token").run({"id": "t9"}, context(USER))

    assert route.calls.last.request.read() == b""
    assert "dataset-generation" not in route.calls.last.request.headers


async def test_sends_a_local_workbook_base64_encoded(api: respx.MockRouter, context: Context, tmp_path: Path) -> None:
    workbook = tmp_path / "stock.xlsx"
    workbook.write_bytes(b"PK\x03\x04 workbook")
    route = api.post("/api/tenants/test/stock-import/commit").respond(json=ok({"posted": 3}))

    await action_tool("cpg_stock_import").run(
        {"action": "commit", "file_path": str(workbook), "previewToken": PREVIEW, "reason": "Count"}, context()
    )

    assert sent(route) == {"previewToken": PREVIEW, "reason": "Count", "workbook": base64.b64encode(b"PK\x03\x04 workbook").decode()}


async def test_names_a_missing_or_unreadable_file_and_sends_nothing(api: respx.MockRouter, context: Context, tmp_path: Path) -> None:
    importer = action_tool("cpg_import")

    with pytest.raises(ApiError) as missing:
        await importer.run({"action": "dry-run"}, context())
    with pytest.raises(ApiError) as unreadable:
        await importer.run({"action": "dry-run", "file_path": str(tmp_path / "nope.xlsx")}, context())

    assert missing.value.field_errors == {"file_path": ["file_path is required."]}
    assert unreadable.value.code == "FILE_UNREADABLE"
    assert "nope.xlsx" in unreadable.value.message
    assert not api.calls


async def test_an_action_without_a_reread_reports_the_conflict_alone(api: respx.MockRouter, context: Context) -> None:
    api.patch("/api/tenants/test/forecasts/00000001/00000001/2026-12-01").respond(409, json=refused("VERSION_CONFLICT"))
    args = {
        "action": "update",
        "material": "00000001",
        "location": "00000001",
        "date": "2026-12-01",
        "quantity": "3",
        "unit": "kg",
        "version": 1,
    }

    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_save_forecast").run(args, context())

    assert "current" not in raised.value.extra


def test_an_action_maps_its_own_path_arguments() -> None:
    action = Action("material-conversions.create", path_args={"id": "material"})

    assert action.arg_of("id") == "material"
    assert action.arg_of("tenant") == "tenant"


# The context tools


async def test_whoami_answers_the_account_the_tenants_and_the_build(api: respx.MockRouter, context: Context) -> None:
    api.get("/api/me").respond(json=ok(USER))
    api.get("/api/tenants").respond(json=ok([{"code": "test"}, {"code": "prod"}]))
    ctx = context(USER)

    result = await tool("cpg_whoami").run({}, ctx)

    assert result == {
        "account": USER,
        "tenants": [{"code": "test"}, {"code": "prod"}],
        "defaultTenant": "test",
        "baseUrl": BASE_URL,
        "server": {"version": __version__, "catalogue": ctx.catalogue.generated_from},
    }
    assert tool("cpg_whoami").definition(ctx) is not None


async def test_help_lists_topics_and_reads_one_in_either_language(context: Context) -> None:
    ctx = context()
    help_tool = tool("cpg_help")

    topics = await help_tool.run({}, ctx)
    english = await help_tool.run({"topic": "mrp"}, ctx)
    polish = await help_tool.run({"topic": "mrp", "locale": "pl"}, ctx)

    assert {"id": "mrp", "title": ctx.catalogue.help["en"]["mrp"].title} in topics
    assert english["screen"] == "/admin/[tenant]/mrp"
    assert english["body"] == list(ctx.catalogue.help["en"]["mrp"].body)
    assert polish["title"] == ctx.catalogue.help["pl"]["mrp"].title
    definition = help_tool.definition(ctx)
    assert definition is not None
    assert "mrp" in definition.input_schema["properties"]["topic"]["enum"]


async def test_help_refuses_an_unknown_topic_or_locale(context: Context) -> None:
    with pytest.raises(ApiError, match="HELP_TOPIC_NOT_FOUND"):
        await tool("cpg_help").run({"topic": "nope"}, context())
    with pytest.raises(ApiError) as raised:
        await tool("cpg_help").run({"locale": "de"}, context())

    assert raised.value.field_errors == {"locale": ["Choose one of: en, pl."]}


async def test_preferences_read_without_arguments_and_change_only_what_is_sent(api: respx.MockRouter, context: Context) -> None:
    api.get("/api/preferences").respond(json=ok({"locale": "en", "theme": "light"}))
    update = api.patch("/api/preferences").respond(json=ok({"locale": "en", "theme": "dark"}))
    preferences = tool("cpg_preferences")

    assert await preferences.run({}, context()) == {"locale": "en", "theme": "light"}
    assert await preferences.run({"theme": "dark", "locale": None}, context()) == {"locale": "en", "theme": "dark"}
    assert sent(update) == {"theme": "dark"}
    definition = preferences.definition(context())
    assert definition is not None
    assert set(definition.input_schema["properties"]) == {"locale", "theme"}


@pytest.mark.parametrize(
    ("tool_name", "args", "stray"),
    [
        ("cpg_save_material", {"action": "create", "type": "raw", "description": "Tin", "baseUnit": "kg", "active": False}, "active"),
        ("cpg_list", {"entity": "materials", "q": "steel"}, "q"),
        ("cpg_get", {"entity": "materials", "id": "00000001", "revision": "2"}, "revision"),
        ("cpg_revoke_token", {"id": "t9", "reason": "old"}, "reason"),
        ("cpg_mrp_accept_proposal", {"run": "00000001", "proposal": "p", "note": "x"}, "note"),
    ],
)
async def test_refuses_a_field_the_chosen_action_would_drop(
    api: respx.MockRouter, context: Context, tool_name: str, args: dict[str, Any], stray: str
) -> None:
    with pytest.raises(ApiError) as raised:
        await action_tool(tool_name).run(args, context())

    assert raised.value.code == "VALIDATION_FAILED"
    assert raised.value.field_errors is not None
    assert list(raised.value.field_errors) == [stray]
    assert raised.value.field_errors[stray][0].startswith("Not accepted by ")
    assert not api.calls


async def test_names_the_tool_when_it_has_no_discriminator(api: respx.MockRouter, context: Context) -> None:
    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_revoke_token").run({"id": "t9", "reason": "old"}, context())

    assert raised.value.field_errors == {"reason": ["Not accepted by cpg_revoke_token."]}


async def test_refuses_a_query_that_is_not_an_object(api: respx.MockRouter, context: Context) -> None:
    with pytest.raises(ApiError) as raised:
        await action_tool("cpg_list").run({"entity": "materials", "query": "q=steel"}, context())

    assert raised.value.field_errors == {"query": ["query must be an object."]}
    assert not api.calls
