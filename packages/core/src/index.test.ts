import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@cpg/core", () => {
  it("exports the public API", () => {
    expect(Object.keys(core).sort()).toEqual([
      "AppError",
      "AuthService",
      "BUILT_IN_ADMIN_USERNAME",
      "INTERNAL_ERROR",
      "INVALID_CREDENTIALS",
      "LoginThrottle",
      "MAX_FAILURES_PER_ACCOUNT",
      "MAX_FAILURES_PER_CLIENT",
      "MIN_ADMIN_PASSWORD_LENGTH",
      "SESSION_TTL_MS",
      "SystemStatusService",
      "THROTTLE_WINDOW_MS",
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
      "revokeBuiltInAdminSessions",
      "serverAction",
      "toDbOptions",
    ]);
  });
});
