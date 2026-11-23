/**
 * `npm run mcp:catalogue`: regenerates `mcp/cpg_mcp/catalogue.json` from the API operation registry and the help
 * topics (spec `2026-11-22--0818UTC-local-mcp-server`). Run it after changing a route, a validator or a help topic,
 * and commit the result: `catalogue.test.ts` fails while the committed file is out of date.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildCatalogue, CATALOGUE_PATH, serializeCatalogue } from "../src/api-catalogue/catalogue";

const target = path.resolve(import.meta.dirname, "..", "..", "..", CATALOGUE_PATH);
writeFileSync(target, serializeCatalogue(buildCatalogue()));
console.info(`Wrote ${CATALOGUE_PATH}.`);
