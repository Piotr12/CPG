// Runs once when the server starts, before it accepts requests: refuse to start without a usable
// admin password, then apply pending migrations, so a broken config or data volume fails the
// deploy instead of the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerConfig, loadConfig, migrateDatabase } = await import("@cpg/core");
    const config = loadConfig();
    try {
      assertServerConfig(config);
    } catch (error) {
      // The standalone server (`node server.js`) only logs a failing `register` and then answers
      // every request with a 500, so exit explicitly: the app must not run without its admin.
      console.error((error as Error).message);
      process.exit(1);
    }
    const applied = await migrateDatabase(config);
    if (applied.length) console.info(`Applied migrations: ${applied.join(", ")}`);
  }
}
