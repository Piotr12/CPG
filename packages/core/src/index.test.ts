import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@cpg/core", () => {
  it("exports the public API", () => {
    expect(Object.keys(core).sort()).toEqual([
      "SystemStatusService",
      "createAppContainer",
      "findWorkspaceRoot",
      "getContainer",
      "globalSingleton",
      "loadConfig",
      "migrateDatabase",
      "requestScope",
      "toDbOptions",
    ]);
  });
});
