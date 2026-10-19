import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@cpg/core", () => {
  it("exports the public API", () => {
    expect(Object.keys(core).sort()).toEqual([
      "AppError",
      "INTERNAL_ERROR",
      "MIN_ADMIN_PASSWORD_LENGTH",
      "SystemStatusService",
      "TooManyRequestsError",
      "UnauthorizedError",
      "ValidationError",
      "assertServerConfig",
      "createAppContainer",
      "fail",
      "findWorkspaceRoot",
      "getContainer",
      "globalSingleton",
      "loadConfig",
      "migrateDatabase",
      "ok",
      "requestScope",
      "serverAction",
      "toDbOptions",
    ]);
  });
});
