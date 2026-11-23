"""The onboarding skill (`skills/cpg-onboarding/SKILL.md`), served as the MCP prompt `cpg_onboarding` (#398, spec A1, A2).

The skill file is the only copy: a client with skill support installs it, and any other client gets the same text as this prompt.
"""

from dataclasses import dataclass
from importlib import resources

PROMPT_NAME = "cpg_onboarding"
SKILL_PATH = "skills/cpg-onboarding/SKILL.md"
FENCE = "---"


@dataclass(frozen=True)
class Skill:
    description: str
    body: str


def parse_skill(text: str) -> Skill:
    """Splits a SKILL.md into its frontmatter `description` and the body after the frontmatter."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != FENCE or FENCE not in (line.strip() for line in lines[1:]):
        raise ValueError(f"{SKILL_PATH} must open with frontmatter between {FENCE} lines.")
    end = next(i for i, line in enumerate(lines[1:], start=1) if line.strip() == FENCE)
    fields = dict(line.split(":", 1) for line in lines[1:end] if ":" in line)
    description = fields.get("description", "").strip()
    if not description:
        raise ValueError(f"{SKILL_PATH} needs a description in its frontmatter.")
    return Skill(description=description, body="\n".join(lines[end + 1 :]).strip() + "\n")


def skill_text() -> str:
    return resources.files("cpg_mcp").joinpath(SKILL_PATH).read_text(encoding="utf-8")


def load_skill() -> Skill:
    return parse_skill(skill_text())
