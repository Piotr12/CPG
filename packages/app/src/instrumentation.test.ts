import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

const config = { databasePath: "/data/cpg.sqlite" };
const core = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  assertServerConfig: vi.fn(),
  migrateDatabase: vi.fn(),
  revokeBuiltInAdminSessions: vi.fn(),
  revokeAdminTokensIfPasswordChanged: vi.fn(),
  seedDemoData: vi.fn(),
}));
vi.mock("@cpg/core", () => core);

describe("register", () => {
  beforeEach(() => {
    core.loadConfig.mockReturnValue(config);
    core.assertServerConfig.mockReset();
    core.revokeBuiltInAdminSessions.mockResolvedValue(0);
    core.revokeAdminTokensIfPasswordChanged.mockResolvedValue(0);
    core.seedDemoData.mockResolvedValue(0);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("checks the config, then migrates the database and logs what it applied", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue(["M1", "M2"]);

    await register();

    expect(core.assertServerConfig).toHaveBeenCalledWith(config);
    expect(core.migrateDatabase).toHaveBeenCalledWith(config);
    expect(console.info).toHaveBeenCalledWith("Applied migrations: M1, M2");
  });

  it("signs the admin out of every session after migrating", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue([]);
    core.revokeBuiltInAdminSessions.mockResolvedValue(3);

    await register();

    expect(core.revokeBuiltInAdminSessions).toHaveBeenCalledWith(config);
    expect(core.migrateDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      core.revokeBuiltInAdminSessions.mock.invocationCallOrder[0],
    );
    expect(console.info).toHaveBeenCalledWith("Signed the admin out of 3 session(s)");
  });

  it("revokes the admin's API tokens after migrating when the admin password changed", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue([]);
    core.revokeAdminTokensIfPasswordChanged.mockResolvedValue(2);

    await register();

    expect(core.revokeAdminTokensIfPasswordChanged).toHaveBeenCalledWith(config);
    expect(core.migrateDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      core.revokeAdminTokensIfPasswordChanged.mock.invocationCallOrder[0],
    );
    expect(console.info).toHaveBeenCalledWith("The admin password changed: revoked 2 admin API token(s)");
  });

  it("seeds the Test demonstration data last, and logs how much (D06)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue([]);
    core.seedDemoData.mockResolvedValue(6);

    await register();

    expect(core.seedDemoData).toHaveBeenCalledWith(config);
    expect(core.revokeAdminTokensIfPasswordChanged.mock.invocationCallOrder[0]).toBeLessThan(
      core.seedDemoData.mock.invocationCallOrder[0],
    );
    expect(console.info).toHaveBeenCalledWith("Seeded the Test tenant with 6 demonstration material(s)");
  });

  it("logs a failed seed and keeps starting: the app works without demo data", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.spyOn(console, "error").mockImplementation(() => {});
    core.migrateDatabase.mockResolvedValue([]);
    const failure = new Error("database is locked");
    core.seedDemoData.mockRejectedValue(failure);

    await expect(register()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("Seeding the Test demonstration data failed:", failure);
  });

  it("logs why and exits, without migrating, when the config is not usable", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    core.assertServerConfig.mockImplementation(() => {
      throw new Error("Missing or too short CPG_ADMIN_PASSWORD");
    });

    await expect(register()).rejects.toThrow("process.exit");
    expect(console.error).toHaveBeenCalledWith("Missing or too short CPG_ADMIN_PASSWORD");
    expect(exit).toHaveBeenCalledWith(1);
    expect(core.migrateDatabase).not.toHaveBeenCalled();
    expect(core.revokeBuiltInAdminSessions).not.toHaveBeenCalled();
    expect(core.revokeAdminTokensIfPasswordChanged).not.toHaveBeenCalled();
    expect(core.seedDemoData).not.toHaveBeenCalled();
  });

  it("stays quiet when there was nothing to migrate or revoke", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue([]);

    await register();

    expect(core.migrateDatabase).toHaveBeenCalledOnce();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("does nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(core.assertServerConfig).not.toHaveBeenCalled();
    expect(core.migrateDatabase).not.toHaveBeenCalled();
  });
});
