import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BundleManifest } from "./manifest";

export const RULES_SUBDIR = "ai-rules";
export const EVOLVE_RULE = "evolve-rules-when-codebase-patterns-change.mdc";

/** Cursor ignores `*.mdc.disabled`; toggling = rename. */
export function disabledName(ruleFile: string): string {
  return `${ruleFile}.disabled`;
}

export function workspaceRulesDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cursor", "rules", RULES_SUBDIR);
}

export function globalMirrorDir(globalStorageRoot: string): string {
  return path.join(globalStorageRoot, "ai-rules-mirror", RULES_SUBDIR);
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

export async function isRuleEnabled(rulesDir: string, ruleFile: string): Promise<boolean> {
  return pathExists(path.join(rulesDir, ruleFile));
}

export async function setRuleEnabled(rulesDir: string, ruleFile: string, enabled: boolean): Promise<void> {
  const active = path.join(rulesDir, ruleFile);
  const dis = path.join(rulesDir, disabledName(ruleFile));
  if (enabled) {
    if (await pathExists(dis)) {
      if (await pathExists(active)) {
        await fs.rm(dis, { force: true });
      } else {
        await fs.rename(dis, active);
      }
    }
    return;
  }
  if (await pathExists(active)) {
    if (await pathExists(dis)) {
      await fs.rm(dis, { force: true });
    }
    await fs.rename(active, dis);
  }
}

export async function setAllMdcsEnabled(
  rulesDir: string,
  mdcs: readonly string[],
  enabled: boolean
): Promise<void> {
  for (const f of mdcs) {
    await setRuleEnabled(rulesDir, f, enabled);
  }
}

export async function wasEvolveEnabledBeforeCopy(rulesDir: string): Promise<boolean> {
  return pathExists(path.join(rulesDir, EVOLVE_RULE));
}

/**
 * Overwrites only manifest files from the bundle; leaves unknown files in the rules folder alone.
 * After copy, turns evolve rule off unless it was already active before this install.
 */
export async function installBundleToRulesDir(
  bundleDir: string,
  rulesDir: string,
  manifest: BundleManifest,
  options: { applyEvolveOffUnlessWasEnabled: boolean }
): Promise<void> {
  const evolveWasEnabled = await wasEvolveEnabledBeforeCopy(rulesDir);
  await fs.mkdir(rulesDir, { recursive: true });
  for (const f of manifest.files) {
    const src = path.join(bundleDir, f);
    const dest = path.join(rulesDir, f);
    await fs.copyFile(src, dest);
  }
  if (options.applyEvolveOffUnlessWasEnabled) {
    await applyEvolveDefaultOff(rulesDir, evolveWasEnabled);
  }
}

export async function applyEvolveDefaultOff(rulesDir: string, wasEvolveEnabledBeforeCopy: boolean): Promise<void> {
  if (!wasEvolveEnabledBeforeCopy) {
    await setRuleEnabled(rulesDir, EVOLVE_RULE, false);
  }
}

function stripDisabledSuffix(filename: string): string {
  if (filename.endsWith(".mdc.disabled")) {
    return filename.slice(0, -".disabled".length);
  }
  return filename;
}

function isShippedRuleFile(name: string, manifest: BundleManifest): boolean {
  if (manifest.files.includes(name)) {
    return true;
  }
  const stripped = stripDisabledSuffix(name);
  if (stripped !== name && manifest.files.includes(stripped)) {
    return true;
  }
  return false;
}

/**
 * Remove files in the rules folder that are not part of the bundle (including evolved one-off rules).
 */
export async function deleteUnshippedFiles(rulesDir: string, manifest: BundleManifest): Promise<void> {
  if (!(await pathExists(rulesDir))) {
    return;
  }
  const entries = await fs.readdir(rulesDir);
  for (const name of entries) {
    if (name.startsWith(".")) {
      continue;
    }
    if (isShippedRuleFile(name, manifest)) {
      continue;
    }
    await fs.rm(path.join(rulesDir, name), { recursive: true, force: true });
  }
}

export async function resetRulesDirToBundle(
  bundleDir: string,
  rulesDir: string,
  manifest: BundleManifest
): Promise<void> {
  await fs.mkdir(path.dirname(rulesDir), { recursive: true });
  await fs.rm(rulesDir, { recursive: true, force: true });
  await fs.cp(bundleDir, rulesDir, { recursive: true });
  await setRuleEnabled(rulesDir, EVOLVE_RULE, false);
  await deleteUnshippedFiles(rulesDir, manifest);
}

export async function syncBundledMdcsToClinerules(
  workspaceRoot: string,
  bundleDir: string,
  manifest: BundleManifest
): Promise<void> {
  const dest = path.join(workspaceRoot, ".clinerules", RULES_SUBDIR);
  await fs.mkdir(dest, { recursive: true });
  const mdcs = manifest.files.filter((f) => f.endsWith(".mdc"));
  for (const mdc of mdcs) {
    const body = await fs.readFile(path.join(bundleDir, mdc), "utf8");
    const outName = `ai-rules-${mdc.replace(/\.mdc$/i, "")}.md`;
    await fs.writeFile(path.join(dest, outName), body, "utf8");
  }
}
