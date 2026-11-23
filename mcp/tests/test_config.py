import pytest

from cpg_mcp.config import DEFAULT_BASE_URL, ConfigError, load_config

TOKEN = "cpg_abc"


def test_defaults_to_production_and_the_test_tenant() -> None:
    config = load_config({"CPG_API_TOKEN": TOKEN})

    assert config.base_url == DEFAULT_BASE_URL == "https://cpg.baby"
    assert config.tenant == "test"
    assert config.token == TOKEN


def test_reads_every_setting_and_normalises_it() -> None:
    config = load_config({"CPG_API_TOKEN": f" {TOKEN} ", "CPG_BASE_URL": "http://localhost:3000/", "CPG_TENANT": "PROD"})

    assert (config.base_url, config.token, config.tenant) == ("http://localhost:3000", TOKEN, "prod")


def test_treats_empty_values_as_unset() -> None:
    config = load_config({"CPG_API_TOKEN": TOKEN, "CPG_BASE_URL": " ", "CPG_TENANT": ""})

    assert (config.base_url, config.tenant) == (DEFAULT_BASE_URL, "test")


@pytest.mark.parametrize("env", [{}, {"CPG_API_TOKEN": "  "}])
def test_requires_a_token_and_says_where_to_get_one(env: dict[str, str]) -> None:
    with pytest.raises(ConfigError, match=r"CPG_API_TOKEN is not set\. Create a token on /admin/tokens"):
        load_config(env)


def test_refuses_a_base_url_without_a_scheme() -> None:
    with pytest.raises(ConfigError, match="CPG_BASE_URL must start with"):
        load_config({"CPG_API_TOKEN": TOKEN, "CPG_BASE_URL": "cpg.baby"})


def test_refuses_an_unknown_tenant_without_repeating_any_value() -> None:
    with pytest.raises(ConfigError) as raised:
        load_config({"CPG_API_TOKEN": TOKEN, "CPG_TENANT": "staging"})

    assert str(raised.value) == "CPG_TENANT must be test or prod."
    assert TOKEN not in str(raised.value)


def test_never_shows_the_token() -> None:
    config = load_config({"CPG_API_TOKEN": TOKEN})

    assert TOKEN not in repr(config)
    assert TOKEN not in str(config)
