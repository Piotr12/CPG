import pytest

from cpg_mcp.onboarding import SKILL_PATH, Skill, load_skill, parse_skill, skill_text


def test_splits_the_description_from_the_body() -> None:
    skill = parse_skill("---\nname: x\ndescription: Use it: first.\n---\n\n# Title\n\nText.\n")

    assert skill == Skill(description="Use it: first.", body="# Title\n\nText.\n")


@pytest.mark.parametrize(
    "text",
    ["", "# No frontmatter\n", "---\nname: x\ndescription: never closed\n", "---\r\nname: x\n"],
)
def test_refuses_a_file_without_closed_frontmatter(text: str) -> None:
    with pytest.raises(ValueError, match="must open with frontmatter"):
        parse_skill(text)


@pytest.mark.parametrize("frontmatter", ["name: x", "name: x\ndescription:   ", "description"])
def test_refuses_a_file_without_a_description(frontmatter: str) -> None:
    with pytest.raises(ValueError, match="needs a description"):
        parse_skill(f"---\n{frontmatter}\n---\nBody\n")


def test_loads_the_packaged_skill_file() -> None:
    skill = load_skill()

    assert skill_text().startswith("---\nname: cpg-onboarding\n")
    assert skill.description.startswith("How to work in CPG")
    assert skill.body.startswith("# Working in CPG as a planner\n")
    assert "description:" not in skill.body
    assert skill.body in skill_text()
    assert SKILL_PATH == "skills/cpg-onboarding/SKILL.md"
