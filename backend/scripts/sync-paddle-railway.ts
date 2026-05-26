/**
 * Print Railway variable instructions from .paddle-railway-sync.json (for MCP/agent).
 * Does not print secret values.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const syncPath = resolve(import.meta.dir, "../.paddle-railway-sync.json");
const sync = JSON.parse(readFileSync(syncPath, "utf8")) as {
  backend: Record<string, string>;
  webapp: Record<string, string>;
  paddle: { webhookUrl: string; defaultPaymentLink: string };
};

console.log(JSON.stringify({ backendKeys: Object.keys(sync.backend), webappKeys: Object.keys(sync.webapp), paddle: sync.paddle }));
