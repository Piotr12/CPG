import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The skill text a fixture package holds. */
export const FIXTURE_SKILL = "---\nname: cpg-onboarding\ndescription: Fixture.\n---\n\nCall `cpg_whoami` first.\n";

/**
 * A minimal `mcp/` folder in a fresh temp directory, with a developer's byte-code caches beside the
 * sources, for tests of the downloads. Returns the folder's path.
 */
export function fixturePackage(): string {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "cpg-agent-downloads-")), "mcp");
  const write = (relative: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  };
  write("pyproject.toml", '[project]\nname = "cpg-mcp"\n');
  write("README.md", "# cpg-mcp\n");
  write("uv.lock", "not shipped\n");
  write("tests/test_server.py", "not shipped\n");
  write("cpg_mcp/__init__.py", '__version__ = "0.1.0"\n');
  write("cpg_mcp/catalogue.json", "{}\n");
  write("cpg_mcp/tools/__init__.py", "");
  write("cpg_mcp/skills/cpg-onboarding/SKILL.md", FIXTURE_SKILL);
  write("cpg_mcp/__pycache__/__init__.cpython-312.pyc", "cache");
  write("cpg_mcp/tools/__pycache__/__init__.cpython-312.pyc", "cache");
  write("cpg_mcp/stray.pyc", "cache");
  write("cpg_mcp/.DS_Store", "finder");
  write("cpg_mcp/tools/.server.py.swp", "swap");
  return root;
}
