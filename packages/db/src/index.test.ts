import { describe, expect, it } from "vitest";
import * as db from "./index";

describe("@cpg/db", () => {
  it("exports the public API", () => {
    expect(Object.keys(db).sort()).toEqual([
      "Setting",
      "createOrmConfig",
      "entities",
      "getMigrationStatus",
      "initOrm",
      "migrate",
    ]);
    expect(db.entities).toEqual([db.Setting]);
  });
});
