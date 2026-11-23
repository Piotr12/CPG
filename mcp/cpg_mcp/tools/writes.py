"""The typed writes any account may make: planning, documents, postings, lifecycle and reversals, and token revoke.

One tool per business operation, so each schema is one the model can fill on the first try. Quantities are decimal
strings in the unit given (R03); stock never goes negative (R09); MRP never edits an existing document (R10).
"""

from cpg_mcp.tools.base import Action, ActionTool

# Spec, edge cases: a write whose answer was lost may have landed; a new call is a second write.
RETRY_NOTE = " After a connection error, read the record again before repeating a write."
QUANTITY_NOTE = ' Quantities are decimal strings ("12.5"), in the unit given; dates are YYYY-MM-DD.'


def _save(name: str, noun: str, concept: str) -> ActionTool:
    return ActionTool(
        name,
        f"Creates a {noun} (action=create, no id) or edits one (action=update, with its id and the version you read)."
        + QUANTITY_NOTE
        + RETRY_NOTE,
        {("create",): Action(f"{concept}.create"), ("update",): Action(f"{concept}.update", reread=f"{concept}.get")},
    )


def write_tools() -> list[ActionTool]:
    return [
        ActionTool(
            "cpg_mrp_run",
            "Runs MRP on the tenant. mode=manual (the default) only proposes; mode=automatic also creates the proposed"
            " documents. MRP never edits or deletes an existing document (R10). Read the result with cpg_report kind=mrp.",
            {(): Action("mrp.runs.create")},
            discriminators=(),
        ),
        ActionTool(
            "cpg_mrp_accept_proposal",
            "Accepts one proposal of the latest MRP run, by the run's ID and the proposal's ID from cpg_report kind=mrp.",
            {(): Action("mrp.proposals.accept")},
            discriminators=(),
        ),
        _save("cpg_save_customer_order", "customer order", "customer-orders"),
        _save("cpg_save_shipment", "shipment", "shipments"),
        _save("cpg_save_purchase_requisition", "purchase requisition", "purchase-requisitions"),
        _save("cpg_save_purchase_order", "purchase order", "purchase-orders"),
        _save("cpg_save_production_order", "production order", "production-orders"),
        _save("cpg_save_transfer", "transfer", "transfers"),
        ActionTool(
            "cpg_post_goods_issue",
            "Posts a goods issue against a shipment: the stock leaves and the order lines are fulfilled." + QUANTITY_NOTE + RETRY_NOTE,
            {(): Action("goods-issues.create")},
            discriminators=(),
        ),
        ActionTool(
            "cpg_post_goods_receipt",
            "Posts a goods receipt against a purchase order: the stock arrives and the lines are received." + QUANTITY_NOTE + RETRY_NOTE,
            {(): Action("goods-receipts.create")},
            discriminators=(),
        ),
        ActionTool(
            "cpg_post_production_completion",
            "action=preview shows what an output would consume by the order's pinned BOM, and posts nothing; action=post"
            " posts the output and the materials actually used." + QUANTITY_NOTE + RETRY_NOTE,
            {("post",): Action("production-completions.create"), ("preview",): Action("production-completions.preview")},
        ),
        ActionTool(
            "cpg_transfer_move",
            "Moves a transfer's stock: dispatch from the origin, receive at the destination, or write off what was lost in"
            " transit (with a reason)." + QUANTITY_NOTE + RETRY_NOTE,
            {
                ("dispatch",): Action("transfers.dispatch"),
                ("receive",): Action("transfers.receive"),
                ("write-off",): Action("transfers.write-off"),
            },
        ),
        ActionTool(
            "cpg_stock_correction",
            "Corrects a material's stock at a location by a signed change, with a reason." + QUANTITY_NOTE + RETRY_NOTE,
            {(): Action("stock.correct")},
            discriminators=(),
        ),
        ActionTool(
            "cpg_stock_import",
            "Imports opening or counted stock from a local .xlsx workbook: action=dry-run checks it and answers a"
            " previewToken; action=commit posts it with that previewToken and a reason.",
            {
                ("dry-run",): Action("stock-import.dry-run", file_field="workbook"),
                ("commit",): Action("stock-import.commit", file_field="workbook"),
            },
        ),
        ActionTool(
            "cpg_document_close",
            "Ends a document at the version you read: action=cancel before any processing, or action=close-early to"
            " abandon what is left after processing. Customer and purchase orders may name lines to act on.",
            {
                ("customer-order", "cancel"): Action("customer-orders.cancel", reread="customer-orders.get"),
                ("customer-order", "close-early"): Action("customer-orders.close-early", reread="customer-orders.get"),
                ("purchase-order", "cancel"): Action("purchase-orders.cancel", reread="purchase-orders.get"),
                ("purchase-order", "close-early"): Action("purchase-orders.close-early", reread="purchase-orders.get"),
                ("purchase-requisition", "cancel"): Action("purchase-requisitions.cancel", reread="purchase-requisitions.get"),
                ("purchase-requisition", "close-early"): Action("purchase-requisitions.close-early", reread="purchase-requisitions.get"),
                ("production-order", "cancel"): Action("production-orders.cancel", reread="production-orders.get"),
                ("production-order", "close-early"): Action("production-orders.close-early", reread="production-orders.get"),
                ("transfer", "cancel"): Action("transfers.cancel", reread="transfers.get"),
                ("transfer", "close-early"): Action("transfers.close-early", reread="transfers.get"),
                ("shipment", "cancel"): Action("shipments.cancel", reread="shipments.get"),
            },
            discriminators=("kind", "action"),
        ),
        ActionTool(
            "cpg_reverse",
            "Reverses a posting today, whole, with a reason: a stock movement (goods receipt, goods issue or correction),"
            " a production completion (id is the order, completionId the completion) or a transfer posting (id is the"
            " transfer, postingId the posting).",
            {
                ("stock-movement",): Action("stock-movements.reverse"),
                ("production-completion",): Action("production-completions.reverse"),
                ("transfer-posting",): Action("transfer-postings.reverse"),
            },
            discriminators=("kind",),
        ),
        ActionTool(
            "cpg_revoke_token",
            "Revokes one of your own API tokens by its id (cpg_list entity=tokens). Revoking the token this server uses stops"
            " it; tokens are created only on /admin/tokens.",
            {(): Action("tokens.revoke")},
            discriminators=(),
        ),
    ]
