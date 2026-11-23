import json

from cpg_mcp.catalogue import ROOT_FIELD, Catalogue, parse_catalogue, validation_errors


def test_loads_every_operation_and_both_help_languages(catalogue: Catalogue) -> None:
    assert len(catalogue.operations) == 117
    assert len(catalogue.generated_from) == 64
    me = catalogue.operation("me.get")
    assert (me.method, me.path, me.write, me.role) == ("GET", "/api/me", None, "any")
    update = catalogue.operation("materials.update")
    assert update.path_params == ("tenant", "id")
    assert update.body is not None
    assert update.body["type"] == "object"
    assert catalogue.help["en"].keys() == catalogue.help["pl"].keys()
    assert catalogue.help["pl"]["mrp"].title != catalogue.help["en"]["mrp"].title


def test_knows_which_role_may_call_an_operation(catalogue: Catalogue) -> None:
    assert catalogue.operation("materials.create").allowed_for("admin")
    assert not catalogue.operation("materials.create").allowed_for("user")
    assert catalogue.operation("materials.list").allowed_for("user")


def test_parses_an_operation_without_schemas() -> None:
    text = json.dumps(
        {
            "generatedFrom": "abc",
            "operations": [
                {"id": "x.get", "method": "GET", "path": "/api/x", "pathParams": [], "role": "any", "write": None, "summary": "X."}
            ],
            "help": {"en": [{"id": "a", "route": "/", "title": "A", "body": ["One.", "Two."]}], "pl": []},
        }
    )
    catalogue = parse_catalogue(text)

    assert catalogue.operation("x.get").body is None
    assert catalogue.operation("x.get").query is None
    assert catalogue.help["en"]["a"].as_markdown() == "# A\n\nOne.\n\nTwo."


def test_validates_the_catalogues_unicode_patterns(catalogue: Catalogue) -> None:
    body = catalogue.operation("materials.update").body
    assert body is not None
    assert "\\p{L}" in json.dumps(body)

    assert validation_errors(body, {"version": 1, "baseUnit": "m²"}) == {}
    assert validation_errors(body, {"version": 1, "baseUnit": "żółw"}) == {}
    errors = validation_errors(body, {"version": 1, "baseUnit": "-bad"})
    assert list(errors) == ["baseUnit"]
    assert "does not match" in errors["baseUnit"][0]


def test_keys_errors_by_dotted_field_and_the_root(catalogue: Catalogue) -> None:
    body = catalogue.operation("customer-orders.create").body
    assert body is not None
    errors = validation_errors(body, {"customer": "00000001", "location": "00000001", "lines": [{"material": "x"}], "extra": 1})

    assert "lines.0" in errors
    assert "lines.0.material" in errors
    assert ROOT_FIELD in errors
    assert any("extra" in message for message in errors[ROOT_FIELD])


def test_finds_nothing_wrong_with_a_valid_query(catalogue: Catalogue) -> None:
    query = catalogue.operation("reports.demand-review").query
    assert query is not None
    assert validation_errors(query, {}) == {}
    assert validation_errors(query, {"material": ["00000001", "00000002"], "bucket": "week"}) == {}
