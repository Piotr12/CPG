"""What every tool shares: the context it runs in, the one call path, and `ActionTool`, which most tools are.

A tool maps its arguments to one catalogue operation: path parameters, a query and a body. The body and query are
checked against that operation's JSON Schema before anything is sent, so a local error names the operation's own
fields; the server's validation stays the authority.
"""

import base64
import json
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import mcp_types as types

from cpg_mcp.catalogue import Catalogue, Operation, validation_errors
from cpg_mcp.client import ApiError, ApiResult, CpgClient
from cpg_mcp.config import TENANTS, Config

# Q4 B: Prod writes are allowed, and this sentence in the tool's description is what asks the agent to check first.
PROD_WARNING = "On the prod tenant, ask the human to confirm before calling."
VERSION_CONFLICT = "VERSION_CONFLICT"
LOCAL_VALIDATION_MESSAGE = "The arguments don't match the API's schema, so nothing was sent. Fix the fields listed and call again."


@dataclass
class ToolContext:
    """What a tool runs with: the API client, the catalogue, the configuration, and the caller from `GET /api/me`."""

    client: CpgClient
    catalogue: Catalogue
    config: Config
    me: Mapping[str, Any] = field(default_factory=dict)

    @property
    def role(self) -> str:
        return str(self.me.get("role", "user"))

    def allowed(self, operation_id: str) -> bool:
        return self.catalogue.operation(operation_id).allowed_for(self.role)


async def execute(
    ctx: ToolContext, operation_id: str, path: Mapping[str, str], query: Mapping[str, Any] | None = None, body: Any = None
) -> ApiResult:
    """Checks the query and body against the operation's schemas, then sends the operation."""
    operation = ctx.catalogue.operation(operation_id)
    errors: dict[str, list[str]] = {}
    if operation.query is not None:
        errors.update(validation_errors(operation.query, dict(query or {})))
    if operation.body is not None:
        errors.update(validation_errors(operation.body, body))
    if errors:
        raise ApiError(None, "VALIDATION_FAILED", LOCAL_VALIDATION_MESSAGE, field_errors=errors, extra={"operation": operation.id})
    return await ctx.client.call(operation, path, query, body)


def payload(result: ApiResult) -> Any:
    """A tool's result: the API's `data`, flagged when the server replayed an earlier answer to the same key."""
    return {"replayed": True, "data": result.data} if result.replayed else result.data


def tenant_property(config: Config) -> dict[str, Any]:
    return {"type": "string", "enum": list(TENANTS), "default": config.tenant, "description": f"The tenant. Defaults to {config.tenant}."}


class Tool(ABC):
    name: str

    @abstractmethod
    def operation_ids(self) -> frozenset[str]:
        """Every catalogue operation this tool can call, whatever the caller's role."""

    @abstractmethod
    def definition(self, ctx: ToolContext) -> types.Tool | None:
        """The tool as the caller's role sees it, or `None` when the role may call none of its operations."""

    @abstractmethod
    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        """Runs the tool and returns its JSON result, or raises `ApiError`."""


@dataclass(frozen=True)
class Action:
    """One way of calling a tool: the operation it sends, and how arguments map onto it."""

    operation: str
    # A path parameter whose tool argument has another name: {"id": "material"}.
    path_args: Mapping[str, str] = field(default_factory=dict)
    # The record's read operation, attached as `current` to a version conflict so the agent can re-plan.
    reread: str | None = None
    # A body field the tool fills with the base64 of the file at `file_path` (the import workbooks).
    file_field: str | None = None
    # Another operation to send when an argument is present: {"revision": "boms.revision"}.
    variants: Mapping[str, str] = field(default_factory=dict)

    def arg_of(self, param: str) -> str:
        return self.path_args.get(param, param)


FILE_PATH_PROPERTY = {"type": "string", "description": "The path of a local .xlsx file; the tool reads it and sends it encoded."}


class ActionTool(Tool):
    """A tool whose discriminating arguments (`action`, `kind`, `entity`, …) pick one operation.

    Its input schema is one object: the discriminators as enums and the union of every action's fields, with each
    action's required fields in the description. Clients such as the Claude API refuse a top-level `oneOf`, so the
    per-action check happens here, against the chosen operation's own schema.
    """

    def __init__(
        self,
        name: str,
        description: str,
        actions: Mapping[tuple[str, ...], Action],
        *,
        discriminators: tuple[str, ...] = ("action",),
        query_arg: str | None = None,
        extra_properties: Mapping[str, Any] | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.actions = dict(actions)
        self.discriminators = discriminators
        # Reads that take the operation's query as one free object argument (`cpg_list`'s `query`).
        self.query_arg = query_arg
        self.extra_properties = dict(extra_properties or {})

    def operation_ids(self) -> frozenset[str]:
        return frozenset(op for action in self.actions.values() for op in (action.operation, *action.variants.values()))

    def _allowed(self, ctx: ToolContext) -> dict[tuple[str, ...], Action]:
        return {key: action for key, action in self.actions.items() if ctx.allowed(action.operation)}

    def _operations(self, ctx: ToolContext, allowed: Mapping[tuple[str, ...], Action]) -> list[Operation]:
        return [ctx.catalogue.operation(action.operation) for action in allowed.values()]

    def definition(self, ctx: ToolContext) -> types.Tool | None:
        allowed = self._allowed(ctx)
        if not allowed:
            return None
        operations = self._operations(ctx, allowed)
        properties: dict[str, Any] = {}
        for index, name in enumerate(self.discriminators):
            properties[name] = {"type": "string", "enum": sorted({key[index] for key in allowed})}
        if any("tenant" in operation.path_params for operation in operations):
            properties["tenant"] = tenant_property(ctx.config)
        lines: list[str] = []
        for key, action in allowed.items():
            branch, required, note = self._branch(ctx, action)
            for prop, schema in branch.items():
                _merge(properties, prop, schema)
            optional = [name for name in branch if name not in required]
            parts = [ctx.catalogue.operation(action.operation).summary]
            parts += [f"Requires: {', '.join(required)}."] if required else []
            parts += [f"Optional: {', '.join(optional)}."] if optional else []
            parts += [note] if note else []
            choice = self._choice(key)
            lines.append(f"- {choice + ': ' if choice else ''}{' '.join(parts)}")
        properties.update(self.extra_properties)
        is_write = any(operation.write is not None for operation in operations)
        description = "\n".join([self.description, *lines])
        if is_write and "tenant" in properties:
            description = f"{description}\n{PROD_WARNING}"
        schema: dict[str, Any] = {"type": "object", "properties": properties, "additionalProperties": False}
        if self.discriminators:
            schema["required"] = list(self.discriminators)
        annotations = types.ToolAnnotations(read_only_hint=not is_write)
        return types.Tool(name=self.name, description=description, input_schema=schema, annotations=annotations)

    def _choice(self, key: tuple[str, ...]) -> str:
        return " ".join(f"{name}={value}" for name, value in zip(self.discriminators, key, strict=True))

    def _accepted(self, operation: Operation, action: Action) -> set[str]:
        """The body or query fields the operation takes from the tool's other arguments."""
        if operation.write is None and self.query_arg:
            return set()
        fields = _object_schema(operation.body if operation.write else operation.query).get("properties", {})
        return {name for name in fields if name != action.file_field}

    def _branch(self, ctx: ToolContext, action: Action) -> tuple[dict[str, Any], list[str], str | None]:
        """An action's own fields, the ones it requires (path parameters first), and its body's note on refused fields."""
        operation = ctx.catalogue.operation(action.operation)
        properties: dict[str, Any] = {}
        required: list[str] = []
        for param in operation.path_params:
            if param != "tenant":
                properties[action.arg_of(param)] = {"type": "string"}
                required.append(action.arg_of(param))
        if self.query_arg is not None:
            properties[self.query_arg] = {"type": "object", "description": "The operation's query parameters."}
        for name, values in action.variants.items():
            properties[name] = {"type": "string", "description": ctx.catalogue.operation(values).summary}
        body = _object_schema(operation.body if operation.write else (None if self.query_arg else operation.query))
        for name, schema in body.get("properties", {}).items():
            if name == action.file_field:
                continue
            properties[name] = schema
        required += [name for name in body.get("required", []) if name != action.file_field]
        if action.file_field:
            properties["file_path"] = FILE_PATH_PROPERTY
            required.append("file_path")
        note = body.get("description")
        return properties, required, note if isinstance(note, str) else None

    def choose_key(self, args: Mapping[str, Any]) -> tuple[str, ...]:
        return tuple(str(args.get(name, "")) for name in self.discriminators)

    def choose(self, args: Mapping[str, Any], ctx: ToolContext) -> Action:
        key = self.choose_key(args)
        allowed = self._allowed(ctx)
        if key in allowed:
            return allowed[key]
        choices = ", ".join(self._choice(k) for k in allowed)
        fields = {name: [f"Choose one of: {choices}."] for name in self.discriminators}
        raise ApiError(None, "VALIDATION_FAILED", f"No such choice for {self.name}.", field_errors=fields)

    async def run(self, args: Mapping[str, Any], ctx: ToolContext) -> Any:
        action = self.choose(args, ctx)
        operation_id = next((op for arg, op in action.variants.items() if args.get(arg) is not None), action.operation)
        operation = ctx.catalogue.operation(operation_id)
        path = {param: str(args[action.arg_of(param)]) for param in operation.path_params if args.get(action.arg_of(param)) is not None}
        if "tenant" in operation.path_params:
            path["tenant"] = str(args.get("tenant") or ctx.config.tenant)
        consumed = {
            *self.discriminators,
            "tenant",
            "file_path",
            *(action.arg_of(param) for param in operation.path_params),
            *action.variants,
            *([self.query_arg] if self.query_arg else []),
        }
        rest = {name: value for name, value in args.items() if name not in consumed}
        # A field another action takes (the union offers it) would be dropped by a lenient server schema, so refuse it.
        accepted = self._accepted(operation, action)
        stray = sorted(name for name in rest if name not in accepted)
        if stray:
            choice = self._choice(self.choose_key(args)) or self.name
            fields = {name: [f"Not accepted by {choice}."] for name in stray}
            raise ApiError(None, "VALIDATION_FAILED", f"{', '.join(stray)} isn't taken by {choice}; nothing was sent.", field_errors=fields)
        if action.file_field:
            rest[action.file_field] = _encoded_file(args.get("file_path"))
        if operation.write is None:
            query = (args.get(self.query_arg) or {}) if self.query_arg else rest
            if not isinstance(query, Mapping):
                field = str(self.query_arg)
                raise ApiError(
                    None, "VALIDATION_FAILED", f"{field} must be an object.", field_errors={field: [f"{field} must be an object."]}
                )
            return payload(await execute(ctx, operation_id, path, query=dict(query)))
        body = rest if operation.body is not None else None
        try:
            return payload(await execute(ctx, operation_id, path, body=body))
        except ApiError as error:
            if error.code == VERSION_CONFLICT and action.reread:
                await _attach_current(error, ctx, action.reread, path)
            raise


def _object_schema(schema: Mapping[str, Any] | None) -> Mapping[str, Any]:
    """An operation schema's object form: itself, or the object branch of an `anyOf` with `null` (the MRP bodies)."""
    if schema is None:
        return {}
    if schema.get("type") == "object":
        return schema
    return next((branch for branch in schema.get("anyOf", []) if branch.get("type") == "object"), {})


def _merge(properties: dict[str, Any], name: str, schema: Any) -> None:
    """Adds an action's field to the union; a field two actions define differently becomes an `anyOf` of both."""
    if name not in properties or properties[name] == schema:
        properties[name] = schema
        return
    current = properties[name]
    variants = current["anyOf"] if "anyOf" in current and set(current) <= {"anyOf", "type"} else [current]
    if schema not in variants:
        variants = [*variants, schema]
    merged: dict[str, Any] = {"anyOf": variants}
    # Some clients rewrite a schema and guess a missing type; give them the one every variant shares.
    kind = variants[0].get("type")
    if kind is not None and all(variant.get("type") == kind for variant in variants):
        merged["type"] = kind
    properties[name] = merged


def _encoded_file(file_path: Any) -> str:
    if not file_path:
        raise ApiError(None, "VALIDATION_FAILED", "file_path is required.", field_errors={"file_path": ["file_path is required."]})
    try:
        return base64.b64encode(Path(str(file_path)).expanduser().read_bytes()).decode("ascii")
    except OSError as error:
        message = f"Can't read {file_path}: {error.strerror or error}. Nothing was sent."
        raise ApiError(None, "FILE_UNREADABLE", message, field_errors={"file_path": [message]}) from None


async def _attach_current(error: ApiError, ctx: ToolContext, reread: str, path: Mapping[str, str]) -> None:
    operation = ctx.catalogue.operation(reread)
    try:
        current = await ctx.client.call(operation, {param: path[param] for param in operation.path_params})
    except ApiError:
        return
    error.extra["current"] = current.data
    error.message = f"{error.message} The record's current state is attached as current: re-plan from it."


def compact(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
