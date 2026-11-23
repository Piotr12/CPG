"""`cpg-mcp`: reads the environment, connects to CPG, and serves MCP over stdio."""

import os
import sys

import anyio

from cpg_mcp.config import ConfigError, load_config
from cpg_mcp.server import StartupError, serve

EXIT_CONFIG = 2
EXIT_STARTUP = 1


def main() -> None:
    try:
        config = load_config(os.environ)
    except ConfigError as error:
        print(f"cpg-mcp: {error}", file=sys.stderr)
        raise SystemExit(EXIT_CONFIG) from None
    try:
        anyio.run(serve, config)
    except StartupError as error:
        print(error, file=sys.stderr)
        raise SystemExit(EXIT_STARTUP) from None


if __name__ == "__main__":
    main()
