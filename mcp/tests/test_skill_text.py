"""The skill names only tools the server registers and help topics the app has (#398, spec A3).

Tools are written in backticks (`cpg_whoami`); help topics as help topic `mrp`, or help topics `boms` and `bom-revisions`.
The catalogue's topics are generated from the app's HELP_TOPIC_IDS, and catalogue.test.ts fails when they drift.
"""

import re

import pytest

from cpg_mcp.catalogue import Catalogue
from cpg_mcp.onboarding import PROMPT_NAME, skill_text
from cpg_mcp.tools import all_tools

TOOL = re.compile(r"`(cpg_[a-z0-9_]+)`")
TOPIC_ID = r"`[a-z0-9-]+`"
TOPICS = re.compile(rf"help topics? ({TOPIC_ID}(?:(?:, and |, | and ){TOPIC_ID})*)", re.IGNORECASE)


def named_tools(text: str) -> set[str]:
    return set(TOOL.findall(text))


def named_topics(text: str) -> set[str]:
    return {topic for group in TOPICS.findall(text) for topic in re.findall(r"`([a-z0-9-]+)`", group)}


def unknown_names(text: str, catalogue: Catalogue) -> tuple[set[str], set[str]]:
    tools = {tool.name for tool in all_tools()} | {PROMPT_NAME}
    return named_tools(text) - tools, named_topics(text) - set(catalogue.help["en"])


def test_finds_tools_and_every_topic_of_a_list() -> None:
    text = "Call `cpg_whoami`, not cpg_list. Help topic `mrp`, help topics `boms` and `bom-revisions`, help topics `a`, `b`, and `c`."

    assert named_tools(text) == {"cpg_whoami"}
    assert named_topics(text) == {"mrp", "boms", "bom-revisions", "a", "b", "c"}


def test_catches_an_unknown_tool_and_an_unknown_topic(catalogue: Catalogue) -> None:
    text = "Call `cpg_whoami`, then `cpg_teleport`; read help topic `mrp` and help topic `time-travel`."

    assert unknown_names(text, catalogue) == ({"cpg_teleport"}, {"time-travel"})


def test_the_skill_names_only_registered_tools_and_existing_topics(catalogue: Catalogue) -> None:
    text = skill_text()

    assert unknown_names(text, catalogue) == (set(), set())


@pytest.mark.parametrize("tool", ["cpg_whoami", "cpg_mrp_run", "cpg_mrp_accept_proposal", "cpg_report", "cpg_reverse"])
def test_the_skill_teaches_the_daily_loops_tools(tool: str) -> None:
    assert tool in named_tools(skill_text())


@pytest.mark.parametrize("topic", ["test-and-prod", "mrp", "demand-review", "stock-report", "variance-report"])
def test_the_skill_links_the_topics_the_loop_needs(topic: str) -> None:
    assert topic in named_topics(skill_text())
