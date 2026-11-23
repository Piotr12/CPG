"""The server's configuration, from the environment only (BACKWARD_COMPATIBILITY.md section 6 lists the variables)."""

from collections.abc import Mapping
from dataclasses import dataclass, field

# Q6 B: an unconfigured server talks to production; the default tenant, Test, is what keeps it off Prod data.
DEFAULT_BASE_URL = "https://cpg.baby"
TENANTS = ("test", "prod")
DEFAULT_TENANT = "test"


class ConfigError(Exception):
    """A setting is missing or malformed. The message names the variable, never its value."""


@dataclass(frozen=True)
class Config:
    base_url: str
    # Never shown: not in repr, logs or errors.
    token: str = field(repr=False)
    tenant: str


def load_config(env: Mapping[str, str]) -> Config:
    """The configuration from `env`: `CPG_API_TOKEN` (required), `CPG_BASE_URL` and `CPG_TENANT`."""
    token = env.get("CPG_API_TOKEN", "").strip()
    if not token:
        raise ConfigError("CPG_API_TOKEN is not set. Create a token on /admin/tokens in CPG and set CPG_API_TOKEN to it.")
    base_url = (env.get("CPG_BASE_URL", "").strip() or DEFAULT_BASE_URL).rstrip("/")
    if not base_url.startswith(("https://", "http://")):
        raise ConfigError("CPG_BASE_URL must start with https:// or http://.")
    tenant = (env.get("CPG_TENANT", "").strip() or DEFAULT_TENANT).lower()
    if tenant not in TENANTS:
        raise ConfigError("CPG_TENANT must be test or prod.")
    return Config(base_url=base_url, token=token, tenant=tenant)
