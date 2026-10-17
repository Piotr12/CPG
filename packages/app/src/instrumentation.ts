// Runs once when the server starts, before it accepts requests: apply pending migrations, so a
// broken data volume fails the deploy instead of the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadConfig } = await import("@cpg/core");
    const { migrate } = await import("@cpg/db");
    const applied = await migrate(loadConfig());
    if (applied.length) console.info(`Applied migrations: ${applied.join(", ")}`);
  }
}
