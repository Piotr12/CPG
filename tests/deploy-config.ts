import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** kamal-proxy's `response_timeout` from config/deploy.yml, in seconds; kamal-proxy's default is 30. */
export function proxyResponseTimeoutSeconds(): number {
  const deploy = parse(readFileSync(join(import.meta.dirname, "..", "config", "deploy.yml"), "utf8")) as {
    proxy: { response_timeout?: number };
  };
  return deploy.proxy.response_timeout ?? 30;
}
