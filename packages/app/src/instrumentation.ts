// Runs once when the server starts, before it accepts requests: refuse to start without a usable
// admin password, apply pending migrations (so a broken config or data volume fails the deploy
// instead of the first request), then sign the admin out everywhere: the admin password can only
// change with a restart, and sessions opened with the old one must not survive it. The admin's API
// tokens end too, but only when the password actually changed: tokens never expire. Last, an
// untouched Test tenant gets its generated demonstration dataset, all of it or nothing; a failure
// there is logged, not fatal, because the app works without it and the next start tries again.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      assertServerConfig,
      loadConfig,
      migrateDatabase,
      revokeAdminTokensIfPasswordChanged,
      revokeBuiltInAdminSessions,
      seedDemoData,
    } = await import("@cpg/core");
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
    const revoked = await revokeBuiltInAdminSessions(config);
    if (revoked) console.info(`Signed the admin out of ${revoked} session(s)`);
    const revokedTokens = await revokeAdminTokensIfPasswordChanged(config);
    if (revokedTokens) console.info(`The admin password changed: revoked ${revokedTokens} admin API token(s)`);
    try {
      const started = performance.now();
      const seed = await seedDemoData(config);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      if (seed.outcome === "seeded") {
        const counts = Object.entries(seed.counts).map(([kind, count]) => `${count} ${kind}`).join(", ");
        console.info(`Seeded the Test tenant with its demonstration dataset in ${seconds} s: ${counts}`);
      } else if (seed.outcome === "skipped") {
        console.info(seed.reason === "read-only"
          ? "Test is read-only: its demonstration dataset was not seeded"
          : "Test already has data: its demonstration dataset was not seeded (reset Test to replace it)");
      } else {
        console.error("Seeding the Test demonstration dataset failed, and nothing was written:", seed.error);
      }
    } catch (error) {
      console.error("Seeding the Test demonstration data failed:", error);
    }
  }
}
