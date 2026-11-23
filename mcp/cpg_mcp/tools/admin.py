"""The admin's tools: master data, the master-data import, the read-only flag and user accounts.

They are offered only when `GET /api/me` says the token is the admin's, so a normal user never sees a tool that
would answer 403. The server still checks every call.
"""

from cpg_mcp.tools.base import Action, ActionTool
from cpg_mcp.tools.writes import QUANTITY_NOTE, RETRY_NOTE

# A8: a password travels in the agent's context, so it comes from the human, never from the model.
CREDENTIAL_NOTE = (
    " A password is the human's to choose: ask them for it, never invent one, and never repeat it back."
    " CPG ends the account's sessions and tokens when its password is reset or it is deactivated."
)


def _keyed(name: str, description: str, concept: str) -> ActionTool:
    return ActionTool(
        name,
        description + " action=update and action=remove take the record's key and the version you read." + QUANTITY_NOTE,
        {("create",): Action(f"{concept}.create"), ("update",): Action(f"{concept}.update"), ("remove",): Action(f"{concept}.remove")},
    )


def admin_tools() -> list[ActionTool]:
    return [
        ActionTool(
            "cpg_save_material",
            "Creates a material (action=create) or edits one (action=update, with its id and the version you read)." + RETRY_NOTE,
            {("create",): Action("materials.create"), ("update",): Action("materials.update", reread="materials.get")},
        ),
        ActionTool(
            "cpg_material_conversion",
            "Adds, changes or removes a material's unit conversion: numerator / denominator base units per one unit.",
            {
                ("create",): Action("material-conversions.create", path_args={"id": "material"}),
                ("update",): Action("material-conversions.update", path_args={"id": "material"}, reread="materials.get"),
                ("remove",): Action("material-conversions.remove", path_args={"id": "material"}, reread="materials.get"),
            },
        ),
        ActionTool(
            "cpg_save_named_record",
            "Creates a location, customer or supplier (action=create, a name) or renames or (de)activates one"
            " (action=update, with its id and the version you read).",
            {
                (kind, action): Action(f"{concept}.{action}", reread=f"{concept}.get" if action == "update" else None)
                for kind, concept in (("location", "locations"), ("customer", "customers"), ("supplier", "suppliers"))
                for action in ("create", "update")
            },
            discriminators=("kind", "action"),
        ),
        _keyed(
            "cpg_save_planning_parameter",
            "Sets how a material is procured at a location: Buy or Make, lead time, lot rules.",
            "planning-parameters",
        ),
        _keyed(
            "cpg_save_safety_stock_target",
            "Sets a material's safety-stock target at a location from an effective date.",
            "safety-stock-targets",
        ),
        _keyed("cpg_save_forecast", "Sets a forecast quantity for a material at a location on a date.", "forecasts"),
        ActionTool(
            "cpg_save_bom",
            "Creates a BOM (action=create) or revises one (action=update, with its id and the version you read; components,"
            " when sent, is the complete list)." + QUANTITY_NOTE,
            {("create",): Action("boms.create"), ("update",): Action("boms.update", reread="boms.get")},
        ),
        ActionTool(
            "cpg_import",
            "Imports master data from a local .xlsx workbook: action=dry-run checks it and answers what would change and a"
            " previewToken; action=commit applies it with that previewToken.",
            {
                ("dry-run",): Action("import.dry-run", file_field="workbook"),
                ("commit",): Action("import.commit", file_field="workbook"),
            },
        ),
        ActionTool(
            "cpg_set_read_only",
            "Makes a tenant read-only (readOnly=true) or writable again (R05). A read-only tenant refuses every write.",
            {(): Action("tenants.set-read-only")},
            discriminators=(),
        ),
        ActionTool(
            "cpg_users",
            "Manages accounts: action=create (username, password), action=set-active (id, active, version) or"
            " action=reset-password (id, password, version). List them with cpg_list entity=users." + CREDENTIAL_NOTE,
            {
                ("create",): Action("users.create"),
                ("set-active",): Action("users.set-active"),
                ("reset-password",): Action("users.reset-password"),
            },
        ),
    ]
