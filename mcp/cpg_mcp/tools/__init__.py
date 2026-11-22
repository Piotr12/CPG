"""Every tool, in the order an agent lists them: context, reads, writes, admin (spec, Tool set)."""

from cpg_mcp.tools.admin import admin_tools
from cpg_mcp.tools.base import Tool
from cpg_mcp.tools.context import Help, Preferences, WhoAmI
from cpg_mcp.tools.reads import audit_tool, get_tool, list_tool, report_tool
from cpg_mcp.tools.writes import write_tools


def all_tools() -> list[Tool]:
    return [WhoAmI(), Help(), Preferences(), list_tool(), get_tool(), report_tool(), audit_tool(), *write_tools(), *admin_tools()]
