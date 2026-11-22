"""API parity (R07, spec step 13): every catalogue operation is fronted by a tool or excluded with a reason."""

import re
from collections.abc import Callable

from cpg_mcp.catalogue import Catalogue
from cpg_mcp.exclusions import EXCLUDED, INTERNAL
from cpg_mcp.server import CpgServer
from cpg_mcp.tools import all_tools
from cpg_mcp.tools.admin import CREDENTIAL_NOTE
from cpg_mcp.tools.base import PROD_WARNING, ToolContext
from tests.conftest import ADMIN, USER

Context = Callable[..., ToolContext]
TOOL_NAME = re.compile(r"^cpg_[a-z]+(?:_[a-z]+)*$")


def fronted() -> set[str]:
    return {operation for tool in all_tools() for operation in tool.operation_ids()}


def test_fronts_or_excludes_every_operation(catalogue: Catalogue) -> None:
    accounted = fronted() | EXCLUDED.keys() | INTERNAL.keys()

    assert sorted(set(catalogue.operations) - accounted) == []


def test_names_only_operations_the_catalogue_has(catalogue: Catalogue) -> None:
    named = fronted() | EXCLUDED.keys() | INTERNAL.keys()

    assert sorted(named - set(catalogue.operations)) == []
    assert not (fronted() & EXCLUDED.keys())
    assert all(reason.endswith(".") for reason in {**EXCLUDED, **INTERNAL}.values())


def test_excludes_exactly_the_test_reset_and_the_two_template_downloads() -> None:
    assert set(EXCLUDED) == {"tenants.test-reset", "import.template", "stock-import.template"}


def test_offers_each_role_the_tools_its_operations_allow(context: Context, catalogue: Catalogue) -> None:
    for me in (USER, ADMIN):
        ctx = context(me)
        expected = {
            tool.name
            for tool in all_tools()
            if any(catalogue.operation(op).allowed_for(ctx.role) for op in tool.operation_ids()) or not tool.operation_ids()
        }

        assert set(CpgServer(ctx).definitions) == expected
    # Spec acceptance: today that is 24 tools for a normal user and 34 for the admin.
    assert (len(CpgServer(context(USER)).definitions), len(CpgServer(context(ADMIN)).definitions)) == (24, 34)


def test_warns_on_every_write_tool_that_can_reach_prod(context: Context, catalogue: Catalogue) -> None:
    definitions = CpgServer(context(ADMIN)).definitions
    writes = {tool.name for tool in all_tools() if any(catalogue.operation(op).write for op in tool.operation_ids())}
    tenant_writes = [name for name in writes if "tenant" in definitions[name].input_schema.get("properties", {})]

    assert len(tenant_writes) >= 25
    assert [name for name in tenant_writes if PROD_WARNING not in (definitions[name].description or "")] == []
    assert PROD_WARNING not in (definitions["cpg_list"].description or "")


def test_tells_the_agent_to_ask_the_human_for_passwords(context: Context) -> None:
    description = CpgServer(context(ADMIN)).definitions["cpg_users"].description or ""

    assert CREDENTIAL_NOTE in description
    assert "ask them for it, never invent one" in description


def test_gives_every_tool_a_unique_name_and_a_plain_object_schema(context: Context) -> None:
    definitions = CpgServer(context(ADMIN)).definitions
    names = [tool.name for tool in all_tools()]

    assert len(names) == len(set(names))
    assert [name for name in names if not TOOL_NAME.match(name)] == []
    for definition in definitions.values():
        schema = definition.input_schema
        assert schema["type"] == "object"
        assert not {"oneOf", "anyOf", "allOf"} & schema.keys(), definition.name
        assert definition.description
