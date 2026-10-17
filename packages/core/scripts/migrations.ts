/**
 * Migration CLI, run with tsx: `npm run db:migrate`, `npm run db:migration:create -- <name>`.
 * Lives in `@cpg/core` because only core knows where the database is (`loadConfig`).
 */
import { runMigrationCli } from "@cpg/db/cli";
import { loadConfig, toDbOptions } from "../src";

await runMigrationCli(process.argv.slice(2), toDbOptions(loadConfig()));
