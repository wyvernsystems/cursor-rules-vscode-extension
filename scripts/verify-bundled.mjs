#!/usr/bin/env node
/**
 * Fails if `bundled/ai-rules` is not a byte-identical mirror of `.cursor/rules/ai-rules`.
 * Rule files may be `*.mdc` or `*.mdc.disabled` on either side; comparison uses logical paths.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, ".cursor", "rules", "ai-rules");
const dstDir = path.join(repoRoot, "bundled", "ai-rules");

function hashFile(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function walkLogicalRules(rootDir) {
  /** @type {Map<string, string>} logical .mdc path -> absolute path on disk */
  const map = new Map();
  function walk(relDir) {
    const abs = path.join(rootDir, relDir);
    if (!fs.existsSync(abs)) {
      return;
    }
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) {
        continue;
      }
      const rel = path.join(relDir, ent.name);
      const full = path.join(rootDir, rel);
      if (ent.isDirectory()) {
        walk(rel);
      } else {
        const norm = rel.split(path.sep).join("/");
        if (norm.endsWith(".mdc.disabled")) {
          const logical = norm.slice(0, -".disabled".length);
          map.set(logical, full);
        } else if (norm.endsWith(".mdc")) {
          map.set(norm, full);
        }
      }
    }
  }
  walk("");
  return map;
}

function walkOtherFiles(rootDir) {
  /** @type {Map<string, string>} */
  const map = new Map();
  function walk(relDir) {
    const abs = path.join(rootDir, relDir);
    if (!fs.existsSync(abs)) {
      return;
    }
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) {
        continue;
      }
      const rel = path.join(relDir, ent.name);
      const full = path.join(rootDir, rel);
      if (ent.isDirectory()) {
        walk(rel);
      } else {
        const norm = rel.split(path.sep).join("/");
        if (!norm.endsWith(".mdc") && !norm.endsWith(".mdc.disabled")) {
          map.set(norm, full);
        }
      }
    }
  }
  walk("");
  return map;
}

if (!fs.existsSync(srcDir)) {
  console.error("Missing:", srcDir);
  process.exit(1);
}
if (!fs.existsSync(dstDir)) {
  console.error("Missing bundled copy:", dstDir, "— run npm run sync-bundled");
  process.exit(1);
}

const problems = [];

const srcRules = walkLogicalRules(srcDir);
const dstRules = walkLogicalRules(dstDir);
for (const logical of new Set([...srcRules.keys(), ...dstRules.keys()])) {
  const a = srcRules.get(logical);
  const b = dstRules.get(logical);
  if (!a) {
    problems.push(`missing rule in source: ${logical}`);
    continue;
  }
  if (!b) {
    problems.push(`missing rule in bundled: ${logical}`);
    continue;
  }
  if (hashFile(a) !== hashFile(b)) {
    problems.push(`content mismatch: ${logical}`);
  }
}

const srcOther = walkOtherFiles(srcDir);
const dstOther = walkOtherFiles(dstDir);
for (const rel of new Set([...srcOther.keys(), ...dstOther.keys()])) {
  const a = srcOther.get(rel);
  const b = dstOther.get(rel);
  if (!a) {
    problems.push(`missing non-mdc in source: ${rel}`);
    continue;
  }
  if (!b) {
    problems.push(`missing non-mdc in bundled: ${rel}`);
    continue;
  }
  if (hashFile(a) !== hashFile(b)) {
    problems.push(`content mismatch: ${rel}`);
  }
}

if (problems.length) {
  console.error("bundled/ai-rules doesn't match .cursor/rules/ai-rules:\n", problems.join("\n"));
  process.exit(1);
}

console.log(
  "OK: bundled/ai-rules matches .cursor/rules/ai-rules (",
  srcRules.size,
  "logical rules +",
  srcOther.size,
  "other files)."
);
