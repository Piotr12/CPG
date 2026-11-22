"""The HTTP client: one catalogue operation per call, with the API's write contract handled for the agent.

The server keeps every rule. This client only removes the mechanics an agent shouldn't carry: the bearer token, a
fresh `Idempotency-Key` per write, the tenant's `Dataset-Generation`, one safe retry, and errors the model can act on.
"""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

from cpg_mcp import __version__
from cpg_mcp.catalogue import Operation
from cpg_mcp.config import Config

# An automatic MRP run on the realistic dataset takes tens of seconds; reads are quick.
READ_TIMEOUT_SECONDS = 30.0
WRITE_TIMEOUT_SECONDS = 120.0
# What kamal-proxy answers while the app restarts or a request queues too long (A4). A 500 may have partly run.
RETRYABLE_STATUSES = frozenset({502, 503, 504})
REPLAYED_HEADER = "Idempotent-Replayed"
STALE_GENERATION_CODES = frozenset({"GENERATION_STALE", "GENERATION_REQUIRED"})

ACCESS_HINT = (
    "The token is invalid or revoked. Ask the human to create a new token on /admin/tokens, set CPG_API_TOKEN and restart cpg-mcp."
)
STALE_HINT = "The Test tenant was reset: every ID read before is void. Read again what you need, then retry with the new IDs."


@dataclass
class ApiError(Exception):
    """A refusal, as `{ status, code, message, fieldErrors?, params? }`, plus anything that helps the agent recover."""

    status: int | None
    code: str
    message: str
    field_errors: Mapping[str, Any] | None = None
    params: Mapping[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"

    def as_json(self) -> dict[str, Any]:
        result: dict[str, Any] = {"status": self.status, "code": self.code, "message": self.message}
        if self.field_errors:
            result["fieldErrors"] = self.field_errors
        if self.params:
            result["params"] = self.params
        return {**result, **self.extra}


@dataclass(frozen=True)
class ApiResult:
    data: Any
    replayed: bool = False


def build_path(operation: Operation, values: Mapping[str, str]) -> str:
    """The operation's path with each `{param}` filled in and escaped."""
    path = operation.path
    for name in operation.path_params:
        if not values.get(name):
            raise ApiError(None, "VALIDATION_FAILED", f"{name} is required.", field_errors={name: [f"{name} is required."]})
        path = path.replace(f"{{{name}}}", quote(str(values[name]), safe=""))
    return path


def encode_query(query: Mapping[str, Any] | None) -> list[tuple[str, str]]:
    """Query parameters as the API reads them: a list repeats its key, a boolean is `true`/`false`, `None` is left out."""
    pairs: list[tuple[str, str]] = []
    for name, value in (query or {}).items():
        for item in value if isinstance(value, list) else [value]:
            if item is None:
                continue
            pairs.append((name, ("true" if item else "false") if isinstance(item, bool) else str(item)))
    return pairs


class CpgClient:
    def __init__(self, config: Config, http: httpx.AsyncClient | None = None) -> None:
        self._config = config
        self._http = http or httpx.AsyncClient()
        self._generations: dict[str, int] = {}

    async def aclose(self) -> None:
        await self._http.aclose()

    async def call(
        self,
        operation: Operation,
        path: Mapping[str, str] | None = None,
        query: Mapping[str, Any] | None = None,
        body: Any = None,
    ) -> ApiResult:
        """Sends one operation and returns its `data`, or raises `ApiError`."""
        url = self._config.base_url + build_path(operation, path or {})
        headers = {"Authorization": f"Bearer {self._config.token}", "User-Agent": f"cpg-mcp/{__version__}", "Accept": "application/json"}
        if operation.write is None:
            response = await self._send(operation.method, url, headers, params=encode_query(query), timeout=READ_TIMEOUT_SECONDS)
            return self._result(response)

        key = str(uuid.uuid4())
        headers["Idempotency-Key"] = key
        tenant = (path or {}).get("tenant")
        if operation.write == "tenant" and tenant:
            headers["Dataset-Generation"] = str(await self.generation(tenant))
        response = await self._send(operation.method, url, headers, json=body, timeout=WRITE_TIMEOUT_SECONDS, key=key)
        try:
            return self._result(response)
        except ApiError as error:
            if error.code in STALE_GENERATION_CODES and tenant:
                await self.generation(tenant, refresh=True)
                error.message = f"{error.message} {STALE_HINT}"
            raise

    async def generation(self, tenant: str, *, refresh: bool = False) -> int:
        """The tenant's current dataset generation, read once and cached until a write finds it stale."""
        if refresh or tenant not in self._generations:
            url = self._config.base_url + f"/api/tenants/{quote(tenant, safe='')}"
            headers = {"Authorization": f"Bearer {self._config.token}", "User-Agent": f"cpg-mcp/{__version__}"}
            response = await self._send("GET", url, headers, timeout=READ_TIMEOUT_SECONDS)
            self._generations[tenant] = int(self._result(response).data["generation"])
        return self._generations[tenant]

    async def _send(
        self, method: str, url: str, headers: Mapping[str, str], *, timeout: float, key: str | None = None, **kwargs: Any
    ) -> httpx.Response:
        """One request, retried once with the same headers (so the same key) on a dropped connection or a proxy error (A4)."""
        try:
            response = await self._http.request(method, url, headers=dict(headers), timeout=timeout, **kwargs)
            if response.status_code not in RETRYABLE_STATUSES:
                return response
        except httpx.TransportError:
            pass
        try:
            return await self._http.request(method, url, headers=dict(headers), timeout=timeout, **kwargs)
        except httpx.TransportError as error:
            raise _transport_error(error, key) from None

    def _result(self, response: httpx.Response) -> ApiResult:
        try:
            envelope = response.json()
        except ValueError:
            raise ApiError(
                response.status_code, "UNEXPECTED_RESPONSE", f"CPG answered HTTP {response.status_code} without a JSON envelope."
            ) from None
        if not isinstance(envelope, dict) or "ok" not in envelope:
            raise ApiError(
                response.status_code, "UNEXPECTED_RESPONSE", f"CPG answered HTTP {response.status_code} without a JSON envelope."
            )
        if envelope["ok"]:
            return ApiResult(envelope.get("data"), replayed=response.headers.get(REPLAYED_HEADER) == "true")
        error = envelope.get("error") or {}
        message = str(error.get("message", ""))
        if response.status_code == 401:
            message = f"{message} {ACCESS_HINT}".strip()
        raise ApiError(response.status_code, str(error.get("code", "UNKNOWN")), message, error.get("fieldErrors"), error.get("params"))


def _transport_error(error: httpx.TransportError, key: str | None) -> ApiError:
    kind = "timed out" if isinstance(error, httpx.TimeoutException) else "could not reach CPG"
    if key is None:
        return ApiError(None, "CONNECTION_FAILED", f"The request {kind}, twice. Check CPG_BASE_URL and the network.")
    message = (
        f"The write {kind}, twice, so it may or may not have been applied. Read the record again before deciding to repeat it:"
        " a new call is a new write."
    )
    return ApiError(None, "CONNECTION_FAILED", message, extra={"idempotencyKey": key})
