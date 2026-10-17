// Runs once when the server starts, before it accepts requests: apply pending migrations, so a
// broken data volume fails the deploy instead of the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadConfig, migrateDatabase } = await import("@cpg/core");
    const applied = await migrateDatabase(loadConfig());
    if (applied.length) console.info(`Applied migrations: ${applied.join(", ")}`);
  }
}
