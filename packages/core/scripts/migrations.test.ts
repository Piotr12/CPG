import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, toDbOptions } from "../src";

const runMigrationCli = vi.hoisted(() => vi.fn());
vi.mock("@cpg/db/cli", () => ({ runMigrationCli }));

describe("scripts/migrations.ts", () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
  });

  it("runs the migration CLI with its arguments against the configured database", async () => {
    process.argv = ["node", "migrations.ts", "create", "add-items"];

    await import("./migrations");

    expect(runMigrationCli).toHaveBeenCalledWith(["create", "add-items"], toDbOptions(loadConfig()));
  });
});
