"""The generic reads: every list, record, report and audit through four tools (Q1 A), driven by the catalogue."""

from cpg_mcp.tools.base import Action, ActionTool

QUERY_HINT = (
    " query holds the operation's query parameters as one object; a refused parameter comes back as a field error"
    " naming it. Lists page with page (from 1) or before/nextBefore, as the answer shows."
)

LISTS = {
    "materials": "materials.list",
    "locations": "locations.list",
    "customers": "customers.list",
    "suppliers": "suppliers.list",
    "boms": "boms.list",
    "planning-parameters": "planning-parameters.list",
    "safety-stock-targets": "safety-stock-targets.list",
    "forecasts": "forecasts.list",
    "customer-orders": "customer-orders.list",
    "shipments": "shipments.list",
    "goods-issues": "goods-issues.list",
    "goods-receipts": "goods-receipts.list",
    "purchase-requisitions": "purchase-requisitions.list",
    "purchase-orders": "purchase-orders.list",
    "production-orders": "production-orders.list",
    "production-order-options": "production-orders.options",
    "transfers": "transfers.list",
    "stock": "stock.get",
    "users": "users.list",
    "tokens": "tokens.list",
}

RECORDS = {
    "materials": Action("materials.get"),
    "locations": Action("locations.get"),
    "customers": Action("customers.get"),
    "suppliers": Action("suppliers.get"),
    "boms": Action("boms.get", variants={"revision": "boms.revision"}),
    "customer-orders": Action("customer-orders.get"),
    "shipments": Action("shipments.get"),
    "goods-issues": Action("goods-issues.get"),
    "goods-receipts": Action("goods-receipts.get"),
    "purchase-requisitions": Action("purchase-requisitions.get"),
    "purchase-orders": Action("purchase-orders.get"),
    "production-orders": Action("production-orders.get"),
    "transfers": Action("transfers.get"),
    "stock-movements": Action("stock-movements.get"),
}

REPORTS = {
    "stock": "reports.stock",
    "variance": "reports.variance",
    "demand-review": "reports.demand-review",
    "mrp": "mrp.runs.latest",
}


def list_tool() -> ActionTool:
    actions = {(entity,): Action(operation) for entity, operation in LISTS.items()}
    actions[("production-completions",)] = Action("production-completions.list", path_args={"id": "parent"})
    return ActionTool(
        "cpg_list",
        "Lists one kind of record in a tenant, a page at a time. Most lists take q (search), sort and dir; stock takes"
        " material and location. production-completions needs parent, the production order's ID." + QUERY_HINT,
        actions,
        discriminators=("entity",),
        query_arg="query",
    )


def get_tool() -> ActionTool:
    return ActionTool(
        "cpg_get",
        "Reads one record by its eight-digit ID (a stock movement by its UUID), with its lines and history. A BOM takes"
        " revision for an earlier revision.",
        {(entity,): action for entity, action in RECORDS.items()},
        discriminators=("entity",),
    )


def report_tool() -> ActionTool:
    return ActionTool(
        "cpg_report",
        "Reads a report: current stock, production variance, the demand review, or the latest MRP run (mrp: projected"
        " balances, proposals and exceptions, a page of material-location pairs at a time)." + QUERY_HINT,
        {(kind,): Action(operation) for kind, operation in REPORTS.items()},
        discriminators=("kind",),
        query_arg="query",
    )


def audit_tool() -> ActionTool:
    return ActionTool(
        "cpg_audit",
        "Reads an audit, newest first: global (accounts, tokens, tenants) or one tenant's records. Filters: subjectType,"
        " subjectId, account, channel (ui|api), from and to (YYYY-MM-DD); page with before and limit." + QUERY_HINT,
        {("global",): Action("audit.global"), ("tenant",): Action("audit.tenant")},
        discriminators=("scope",),
        query_arg="query",
    )
