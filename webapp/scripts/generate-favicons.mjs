/**
 * Rasterize public/ordostage-logo.svg into PNG favicons for browsers and Google Search.
 * Run from webapp: `bun run scripts/generate-favicons.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "ordostage-logo.svg");
const input = readFileSync(svgPath);

const sizes = [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["favicon-48.png", 48],
  ["apple-touch-icon.png", 180],
  ["android-chrome-192x192.png", 192],
];

for (const [name, size] of sizes) {
  const out = join(root, "public", name);
  await sharp(input).resize(size, size).png().toFile(out);
  console.log("wrote", name);
}

const [b16, b32, b48] = await Promise.all([16, 32, 48].map((s) => sharp(input).resize(s, s).png().toBuffer()));
const ico = await toIco([b16, b32, b48], { resize: false });
const icoPath = join(root, "public", "favicon.ico");
writeFileSync(icoPath, ico);
console.log("wrote favicon.ico");
