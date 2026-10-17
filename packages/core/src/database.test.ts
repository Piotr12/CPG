import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { migrateDatabase, toDbOptions } from "./database";

describe("toDbOptions", () => {
  it("passes on the database path and the SQL debug flag", () => {
    const config = loadConfig({ DATA_DIR: "/data", DEBUG_SQL: "1" });

    expect(toDbOptions(config)).toEqual({ databasePath: "/data/cpg.sqlite", debug: true });
  });
});

describe("migrateDatabase", () => {
  it("applies pending migrations once", async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-core-")) });

    expect(await migrateDatabase(config)).toEqual(["Migration20261017091007_initial"]);
    expect(await migrateDatabase(config)).toEqual([]);
  });
});
