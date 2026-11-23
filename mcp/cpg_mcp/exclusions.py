"""The catalogue operations no tool fronts, each with its reason. The parity test fails on any other gap."""

EXCLUDED = {
    "tenants.test-reset": "Q5 A: an agent never resets Test; the human does it on the Tenants page.",
    "import.template": "A binary .xlsx download for a human to fill in.",
    "stock-import.template": "A binary .xlsx download for a human to fill in.",
}

# Called by the client itself, not offered as a tool.
INTERNAL = {
    "tenants.get": "The client reads a tenant's dataset generation from it before the tenant's first write.",
}
