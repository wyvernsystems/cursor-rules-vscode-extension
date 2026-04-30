#!/usr/bin/env node
/**
 * Copies `.cursor/rules/ai-rules/` → `bundled/ai-rules/`
 * and writes `bundled/manifest.json` listing shipped files.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, ".cursor", "rules", "ai-rules");
const destDir = path.join(repoRoot, "bundled", "ai-rules");
const manifestPath = path.join(repoRoot, "bundled", "manifest.json");

if (!fs.existsSync(sourceDir)) {
  console.error("Missing source rules folder:", sourceDir);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destDir), { recursive: true });
fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(sourceDir, destDir, { recursive: true });

const files = fs
  .readdirSync(destDir)
  .filter((name) => !name.startsWith("."))
  .sort();

fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
console.log("Synced", files.length, "files to bundled/ai-rules/ and wrote manifest.json");
