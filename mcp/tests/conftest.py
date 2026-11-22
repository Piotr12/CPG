from collections.abc import Callable, Iterator
from typing import Any

import pytest
import respx

from cpg_mcp.catalogue import Catalogue, load_catalogue
from cpg_mcp.client import CpgClient
from cpg_mcp.config import Config
from cpg_mcp.tools.base import ToolContext

BASE_URL = "https://cpg.test"
TOKEN = "cpg_secret-token-value"
ADMIN = {"id": "u1", "username": "admin", "role": "admin", "token": {"id": "t1", "name": "laptop agent"}}
USER = {"id": "u2", "username": "planner1", "role": "user", "token": {"id": "t2", "name": "agent"}}


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}


def refused(code: str, message: str = "Refused.", **extra: Any) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message, **extra}}


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def catalogue() -> Catalogue:
    return load_catalogue()


@pytest.fixture
def config() -> Config:
    return Config(base_url=BASE_URL, token=TOKEN, tenant="test")


@pytest.fixture
def api() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.get("/api/tenants/test").respond(json=ok({"code": "test", "generation": 7, "readOnly": False}))
        router.get("/api/tenants/prod").respond(json=ok({"code": "prod", "generation": 1, "readOnly": False}))
        yield router


@pytest.fixture
def context(catalogue: Catalogue, config: Config) -> Callable[..., ToolContext]:
    def make(me: dict[str, Any] = ADMIN) -> ToolContext:
        return ToolContext(client=CpgClient(config, retry_delay=0), catalogue=catalogue, config=config, me=me)

    return make
