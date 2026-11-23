import runpy
import sys
from typing import Any

import pytest

from cpg_mcp import __main__ as entry
from cpg_mcp.config import Config
from cpg_mcp.server import StartupError, serve


def test_exits_2_and_names_the_missing_variable(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("CPG_API_TOKEN", raising=False)

    with pytest.raises(SystemExit) as raised:
        entry.main()

    assert raised.value.code == 2
    assert capsys.readouterr().err.startswith("cpg-mcp: CPG_API_TOKEN is not set.")


def test_serves_with_the_environments_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[Any, ...]] = []
    monkeypatch.setenv("CPG_API_TOKEN", "cpg_x")
    monkeypatch.setenv("CPG_TENANT", "prod")
    monkeypatch.setattr(entry.anyio, "run", lambda *args: calls.append(args))

    entry.main()

    assert calls == [(serve, Config(base_url="https://cpg.baby", token="cpg_x", tenant="prod"))]


def test_exits_1_with_the_startup_message(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    def refuse(*_: Any) -> None:
        raise StartupError("cpg-mcp can't start: Invalid or revoked token.")

    monkeypatch.setenv("CPG_API_TOKEN", "cpg_x")
    monkeypatch.setattr(entry.anyio, "run", refuse)

    with pytest.raises(SystemExit) as raised:
        entry.main()

    assert raised.value.code == 1
    assert capsys.readouterr().err == "cpg-mcp can't start: Invalid or revoked token.\n"


def test_runs_as_a_module(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CPG_API_TOKEN", raising=False)
    monkeypatch.delitem(sys.modules, "cpg_mcp.__main__")

    with pytest.raises(SystemExit) as raised:
        runpy.run_module("cpg_mcp", run_name="__main__")

    assert raised.value.code == 2
