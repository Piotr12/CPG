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
      "MAX_BUCKETS",
      "MAX_FAILURES_PER_ACCOUNT",
      "MAX_FAILURES_PER_CLIENT",
      "MIN_ADMIN_PASSWORD_LENGTH",
      "NotFoundError",
      "PRUNE_INTERVAL_MS",
      "SESSION_TTL_MS",
      "SystemStatusService",
      "TENANT_CODES",
      "TENANT_NAMES",
      "THROTTLE_WINDOW_MS",
      "TenantService",
      "TooManyRequestsError",
      "UnauthorizedError",
      "ValidationError",
      "apiHandler",
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
      "scopeForTenant",
      "serverAction",
      "tenantCodeSchema",
      "tenantNotFound",
      "tenantScope",
      "tenantServerAction",
      "toDbOptions",
    ]);
  });
});
