import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load backend/.env into process.env before env schema validation (for CLI scripts). */
export function loadBackendDotEnv(): void {
  const envPath = resolve(import.meta.dir, "../.env");
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // .env wins over inherited shell env (e.g. stale PADDLE_ENV=sandbox in CI/agent shells).
    process.env[key] = value;
  }
}
