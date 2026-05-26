/**
 * Create OrdoStage product + reference prices in Paddle (live or sandbox per PADDLE_ENV).
 *
 *   cd backend && bun run paddle:setup-catalog
 *
 * Prints PADDLE_PRODUCT_ID for Railway / .env after success.
 */
import { loadBackendDotEnv } from "./loadDotEnv";

loadBackendDotEnv();

const { ensureOrdoStagePaddleCatalog } = await import("../src/paddleCatalog");

const result = await ensureOrdoStagePaddleCatalog();

console.log("\n✅ Paddle catalog ready\n");
console.log(`Environment:     ${result.environment}`);
console.log(`Product ID:      ${result.productId}${result.productCreated ? " (created)" : " (existing)"}`);
console.log("\nPrices:");
for (const p of result.prices) {
  console.log(`  - ${p.description}: ${p.id}${p.created ? " (created)" : " (existing)"}`);
}
console.log("\nAdd to backend env (Railway + local .env):\n");
console.log(`PADDLE_PRODUCT_ID="${result.productId}"`);
console.log("");
