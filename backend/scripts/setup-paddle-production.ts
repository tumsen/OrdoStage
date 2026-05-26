/**
 * Provision Paddle live: catalog, client-side token, webhook destination.
 * Updates backend/.env and writes gitignored .paddle-railway-sync.json for Railway.
 *
 *   cd backend && bun run paddle:setup-production
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadBackendDotEnv } from "./loadDotEnv";

loadBackendDotEnv();

const { env } = await import("../src/env.ts");
const { setupPaddleProduction } = await import("../src/paddleProductionSetup.ts");

const webhookBase =
  process.env.RAILWAY_BACKEND_URL?.trim() ||
  env.BACKEND_URL?.trim() ||
  "https://backend-ordostage.up.railway.app";

const frontendUrl =
  process.env.RAILWAY_FRONTEND_URL?.trim() ||
  env.FRONTEND_URL?.trim() ||
  "https://www.ordostage.com";

const result = await setupPaddleProduction({ webhookBaseUrl: webhookBase, frontendUrl });

const envPath = resolve(import.meta.dir, "../.env");
let envText = "";
try {
  envText = await Bun.file(envPath).text();
} catch {
  envText = "";
}

function upsertEnvLine(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return text.trimEnd() + (text.endsWith("\n") ? "" : "\n") + line + "\n";
}

envText = upsertEnvLine(envText, "PADDLE_API_KEY", env.PADDLE_API_KEY ?? "");
envText = upsertEnvLine(envText, "PADDLE_ENV", "live");
envText = upsertEnvLine(envText, "PADDLE_PRODUCT_ID", result.productId);
envText = upsertEnvLine(envText, "PADDLE_WEBHOOK_SECRET", result.webhookSecret);
envText = upsertEnvLine(envText, "BACKEND_URL", webhookBase.replace(/\/+$/, ""));
envText = upsertEnvLine(envText, "FRONTEND_URL", frontendUrl.replace(/\/+$/, ""));
await Bun.write(envPath, envText);

const syncPath = resolve(import.meta.dir, "../.paddle-railway-sync.json");
writeFileSync(
  syncPath,
  JSON.stringify(
    {
      backend: {
        PADDLE_API_KEY: env.PADDLE_API_KEY,
        PADDLE_ENV: "live",
        PADDLE_PRODUCT_ID: result.productId,
        PADDLE_WEBHOOK_SECRET: result.webhookSecret,
        FRONTEND_URL: frontendUrl.replace(/\/+$/, ""),
      },
      webapp: {
        VITE_PADDLE_CLIENT_TOKEN: result.clientSideToken,
        VITE_PADDLE_ENV: "production",
      },
      paddle: {
        webhookUrl: result.webhookUrl,
        defaultPaymentLink: result.frontendUrl,
      },
    },
    null,
    2,
  ),
);

console.log("\n✅ Paddle production setup complete\n");
console.log(`Environment:        ${result.environment}`);
console.log(`Product ID:           ${result.productId}`);
console.log(`Client token:         ${result.clientTokenCreated ? "created" : "reused"} (live_…)`);
console.log(`Webhook:              ${result.webhookUrl} (${result.webhookCreated ? "created" : "existing"})`);
console.log(`Default payment link: ${result.frontendUrl} (set manually in Paddle → Checkout settings)`);
console.log("\nUpdated backend/.env and wrote .paddle-railway-sync.json");
console.log("Run: bun run paddle:sync-railway\n");
