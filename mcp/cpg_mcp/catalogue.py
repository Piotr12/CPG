"""The operation catalogue: `catalogue.json`, generated from the app by `npm run mcp:catalogue` and committed beside this file."""

import json
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from importlib import resources
from typing import Any

import regex
from jsonschema import Draft202012Validator, ValidationError, validators

LOCALES = ("en", "pl")


@dataclass(frozen=True)
class Operation:
    """One API route handler, as the app's operation registry describes it."""

    id: str
    method: str
    path: str
    path_params: tuple[str, ...]
    role: str
    write: str | None
    summary: str
    body: Mapping[str, Any] | None = None
    query: Mapping[str, Any] | None = None

    def allowed_for(self, role: str) -> bool:
        return self.role == "any" or role == "admin"


@dataclass(frozen=True)
class HelpTopic:
    id: str
    route: str
    title: str
    body: tuple[str, ...]

    def as_markdown(self) -> str:
        return "\n\n".join([f"# {self.title}", *self.body])


@dataclass(frozen=True)
class Catalogue:
    generated_from: str
    operations: Mapping[str, Operation]
    help: Mapping[str, Mapping[str, HelpTopic]]

    def operation(self, operation_id: str) -> Operation:
        return self.operations[operation_id]


def parse_catalogue(text: str) -> Catalogue:
    raw = json.loads(text)
    operations = {
        entry["id"]: Operation(
            id=entry["id"],
            method=entry["method"],
            path=entry["path"],
            path_params=tuple(entry["pathParams"]),
            role=entry["role"],
            write=entry["write"],
            summary=entry["summary"],
            body=entry.get("body"),
            query=entry.get("query"),
        )
        for entry in raw["operations"]
    }
    help_topics = {
        locale: {topic["id"]: HelpTopic(topic["id"], topic["route"], topic["title"], tuple(topic["body"])) for topic in raw["help"][locale]}
        for locale in LOCALES
    }
    return Catalogue(generated_from=raw["generatedFrom"], operations=operations, help=help_topics)


def load_catalogue() -> Catalogue:
    """The catalogue this package ships with."""
    return parse_catalogue(resources.files("cpg_mcp").joinpath("catalogue.json").read_text(encoding="utf-8"))


def _pattern(validator: Any, pattern: str, instance: Any, schema: Mapping[str, Any]) -> Iterator[ValidationError]:
    """`pattern` with the `regex` package: the catalogue's patterns are ECMA-262, with `\\p{L}`-style escapes."""
    if validator.is_type(instance, "string") and not regex.search(pattern, instance):
        yield ValidationError(f"{instance!r} does not match {pattern!r}")


_Validator = validators.extend(Draft202012Validator, {"pattern": _pattern})

ROOT_FIELD = "(root)"


def _field(error: ValidationError) -> str:
    """The field an error is about, dotted as the API keys `fieldErrors` (`lines.2.unit`)."""
    path = ".".join(str(part) for part in error.absolute_path)
    return path or ROOT_FIELD


def validation_errors(schema: Mapping[str, Any], value: Any) -> dict[str, list[str]]:
    """Every way `value` fails `schema`, by field; empty when it passes."""
    errors: dict[str, list[str]] = {}
    for error in sorted(_Validator(schema).iter_errors(value), key=lambda error: list(map(str, error.absolute_path))):
        errors.setdefault(_field(error), []).append(error.message)
    return errors
