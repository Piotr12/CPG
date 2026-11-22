import { createHash } from "node:crypto";
import { toToolJsonSchema, type ToolJsonSchema } from "@cpg/core";
import { helpTopics, type HelpTopic } from "../help/topics";
import { API_OPERATIONS, type ApiMethod, type ApiOperation, type OperationRole, type OperationWrite } from "./operations";

/** Where the catalogue is committed, from the repository root; the MCP server reads it at startup. */
export const CATALOGUE_PATH = "mcp/cpg_mcp/catalogue.json";

/** One operation as the MCP server reads it: the registry entry, with its schemas as JSON Schema. */
export interface CatalogueOperation {
  id: string;
  method: ApiMethod;
  path: string;
  /** The `{name}` segments of `path`, in order. */
  pathParams: string[];
  role: OperationRole;
  write: OperationWrite;
  summary: string;
  body?: ToolJsonSchema;
  query?: ToolJsonSchema;
}

/** `mcp/cpg_mcp/catalogue.json`: an internal build artefact, not a protected contract (spec, Risks). */
export interface Catalogue {
  /** A SHA-256 of everything below it, so `cpg_whoami` can show which build a server runs on. */
  generatedFrom: string;
  operations: CatalogueOperation[];
  /** Every help topic in both languages (spec A5): there is no help API. */
  help: { en: HelpTopic[]; pl: HelpTopic[] };
}

const pathParamsOf = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);

/** An entry with its keys in a fixed order, so the committed JSON only changes when the API does. */
function describe({ id, method, path, role, write, summary, body, query }: ApiOperation): CatalogueOperation {
  return {
    id,
    method,
    path,
    pathParams: pathParamsOf(path),
    role,
    write,
    summary,
    ...(body && { body: toToolJsonSchema(body) }),
    ...(query && { query: toToolJsonSchema(query) }),
  };
}

/**
 * The catalogue the MCP server builds its tools from (spec `2026-11-22--0818UTC-local-mcp-server`): every
 * operation with its JSON schemas, and the help topics. Pure; `npm run mcp:catalogue` writes it.
 */
export function buildCatalogue(operations: readonly ApiOperation[] = API_OPERATIONS): Catalogue {
  const content = { operations: operations.map(describe), help: { en: helpTopics("en"), pl: helpTopics("pl") } };
  const generatedFrom = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return { generatedFrom, ...content };
}

/** The catalogue as committed: two-space JSON with a final newline. */
export const serializeCatalogue = (catalogue: Catalogue) => `${JSON.stringify(catalogue, null, 2)}\n`;
