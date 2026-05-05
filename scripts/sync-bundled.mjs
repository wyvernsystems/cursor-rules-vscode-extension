#!/usr/bin/env node
/**
 * Copies `.cursor/rules/ai-rules/` → `bundled/ai-rules/` (recursive)
 * and writes `bundled/manifest.json`. Each rule appears **once** as a logical
 * `*.mdc` path (whether the file on disk is `*.mdc` or `*.mdc.disabled`).
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

function listShippedFiles(rootDir) {
  const out = [];
  const walk = (relDir) => {
    const abs = path.join(rootDir, relDir);
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) {
        continue;
      }
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(rel);
      } else {
        out.push(rel);
      }
    }
  };
  walk("");
  return out.sort();
}

const rawFiles = listShippedFiles(destDir);

const nonMdc = [];
const activeLogical = new Set();
const disabledLogical = new Set();

for (const rel of rawFiles) {
  const norm = rel.split(path.sep).join("/");
  if (norm.endsWith(".mdc.disabled")) {
    const logical = norm.slice(0, -".disabled".length);
    if (!logical.endsWith(".mdc")) {
      throw new Error(`Invalid rule filename: ${norm}`);
    }
    if (activeLogical.has(logical)) {
      throw new Error(`Rule listed both active and disabled: ${logical}`);
    }
    disabledLogical.add(logical);
  } else if (norm.endsWith(".mdc")) {
    if (disabledLogical.has(norm)) {
      throw new Error(`Rule listed both active and disabled: ${norm}`);
    }
    activeLogical.add(norm);
  } else {
    nonMdc.push(norm);
  }
}

const logicalMdcs = [...new Set([...activeLogical, ...disabledLogical])].sort((a, b) =>
  a.localeCompare(b)
);

const manifestFiles = [...nonMdc.sort((a, b) => a.localeCompare(b)), ...logicalMdcs];

fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, files: manifestFiles }, null, 2) + "\n", "utf8");
console.log(
  "Synced",
  rawFiles.length,
  "files to bundled/ai-rules/; manifest",
  manifestFiles.length,
  "entries."
);
