import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import type { BundleManifest } from "./manifest";
import {
  assertContainedPath,
  assertSafeDeletionTarget,
  isSafeManifestEntry,
} from "./safePaths";

export const RULES_SUBDIR = "ai-rules";

/**
 * Manifest paths use forward slashes; `path.join` normalizes them per platform
 * when we touch disk, so we keep slashes in the constant for stable comparisons.
 */
export const EVOLVE_RULE = "rules-for-rules/evolve-rules-when-codebase-patterns-change.mdc";

const RULES_DIR_SEGMENTS = [".cursor", "rules", RULES_SUBDIR] as const;
const GLOBAL_MIRROR_SEGMENTS = ["ai-rules-mirror", RULES_SUBDIR] as const;

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

/**
 * Resolves `entry` under `base` after rejecting unsafe shapes (traversal,
 * absolute paths, suspicious characters) and confirming the resolved path
 * stays inside `base`. Centralized so every manifest-driven path goes through
 * the same gate.
 */
function safeJoinUnderBase(base: string, entry: string, label: string): string {
  if (!isSafeManifestEntry(entry)) {
    throw new Error(`Refusing unsafe rule path: ${entry}`);
  }
  const resolved = path.join(base, entry);
  assertContainedPath(base, resolved, label);
  return resolved;
}

/**
 * Recursive copy that refuses to follow symlinks. The bundled folder shipped
 * inside the VSIX should never contain symlinks, but a tampered install could,
 * so we filter them out by lstat before each entry is copied.
 */
async function copyTreeWithoutSymlinks(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (entrySrc) => {
      try {
        return !fsSync.lstatSync(entrySrc).isSymbolicLink();
      } catch {
        return false;
      }
    },
  });
}

export async function isRuleEnabled(rulesDir: string, ruleFile: string): Promise<boolean> {
  const target = safeJoinUnderBase(rulesDir, ruleFile, "rules directory");
  return pathExists(target);
}

export async function setRuleEnabled(
  rulesDir: string,
  ruleFile: string,
  enabled: boolean
): Promise<void> {
  const active = safeJoinUnderBase(rulesDir, ruleFile, "rules directory");
  const dis = `${active}.disabled`;
  if (enabled) {
    if (await pathExists(dis)) {
      if (await pathExists(active)) {
        await fs.rm(dis, { force: true });
      } else {
        await fs.mkdir(path.dirname(active), { recursive: true });
        await fs.rename(dis, active);
      }
    }
    return;
  }
  if (await pathExists(active)) {
    if (await pathExists(dis)) {
      await fs.rm(dis, { force: true });
    }
    await fs.mkdir(path.dirname(dis), { recursive: true });
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
  return pathExists(safeJoinUnderBase(rulesDir, EVOLVE_RULE, "rules directory"));
}

/**
 * Bundled packs list logical rule paths (`*.mdc`). On disk the file may be
 * `path.mdc` or `path.mdc.disabled` when the default is off.
 */
async function resolveBundledRuleSource(
  bundleDir: string,
  logicalRuleFile: string
): Promise<{ srcPath: string; storeAsDisabled: boolean }> {
  const active = safeJoinUnderBase(bundleDir, logicalRuleFile, "bundle directory");
  const dis = `${active}.disabled`;
  if (await pathExists(active)) {
    return { srcPath: active, storeAsDisabled: false };
  }
  if (await pathExists(dis)) {
    return { srcPath: dis, storeAsDisabled: true };
  }
  throw new Error(
    `Bundled pack missing ${logicalRuleFile} (need ${logicalRuleFile} or ${logicalRuleFile}.disabled)`
  );
}

/**
 * Overwrites only manifest files from the bundle; leaves unknown files in the
 * rules folder alone. After copy, turns the evolve rule off unless it was
 * already active before this install.
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
    if (!f.endsWith(".mdc")) {
      const src = safeJoinUnderBase(bundleDir, f, "bundle directory");
      const dest = safeJoinUnderBase(rulesDir, f, "rules directory");
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      continue;
    }
    const { srcPath, storeAsDisabled } = await resolveBundledRuleSource(bundleDir, f);
    const destBase = safeJoinUnderBase(rulesDir, f, "rules directory");
    const dest = storeAsDisabled ? `${destBase}.disabled` : destBase;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(srcPath, dest);
  }
  if (options.applyEvolveOffUnlessWasEnabled) {
    await applyEvolveDefaultOff(rulesDir, evolveWasEnabled);
  }
}

export async function applyEvolveDefaultOff(
  rulesDir: string,
  wasEvolveEnabledBeforeCopy: boolean
): Promise<void> {
  if (!wasEvolveEnabledBeforeCopy) {
    await setRuleEnabled(rulesDir, EVOLVE_RULE, false);
  }
}

/**
 * Per-file copy of a validated manifest from a trusted source dir into a
 * trusted destination dir. Used by "Copy global mirror into workspace".
 */
export async function copyManifestFiles(
  sourceDir: string,
  destDir: string,
  manifest: BundleManifest
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  for (const f of manifest.files) {
    if (!f.endsWith(".mdc")) {
      const src = safeJoinUnderBase(sourceDir, f, "source directory");
      const dest = safeJoinUnderBase(destDir, f, "destination directory");
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      continue;
    }
    const { srcPath, storeAsDisabled } = await resolveBundledRuleSource(sourceDir, f);
    const destBase = safeJoinUnderBase(destDir, f, "destination directory");
    const dest = storeAsDisabled ? `${destBase}.disabled` : destBase;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(srcPath, dest);
  }
}

/**
 * Replace `globalDir` with a fresh copy of `bundleDir`. Asserts `globalDir`
 * looks like the extension's mirror so we can never recursively delete an
 * unrelated path even if a constant is corrupted at runtime.
 */
export async function replaceGlobalMirror(globalDir: string, bundleDir: string): Promise<void> {
  assertSafeDeletionTarget(globalDir, GLOBAL_MIRROR_SEGMENTS, "global mirror");
  await fs.mkdir(path.dirname(globalDir), { recursive: true });
  await fs.rm(globalDir, { recursive: true, force: true });
  await copyTreeWithoutSymlinks(bundleDir, globalDir);
}

export async function removeGlobalMirror(globalDir: string): Promise<void> {
  assertSafeDeletionTarget(globalDir, GLOBAL_MIRROR_SEGMENTS, "global mirror");
  await fs.rm(globalDir, { recursive: true, force: true });
}

function stripDisabledSuffix(filename: string): string {
  if (filename.endsWith(".mdc.disabled")) {
    return filename.slice(0, -".disabled".length);
  }
  return filename;
}

function isShippedRuleFile(relPath: string, manifest: BundleManifest): boolean {
  if (manifest.files.includes(relPath)) {
    return true;
  }
  const stripped = stripDisabledSuffix(relPath);
  if (stripped !== relPath && manifest.files.includes(stripped)) {
    return true;
  }
  return false;
}

/**
 * Walks `rulesDir` recursively and returns repo-relative paths using forward
 * slashes—matches the manifest format so comparisons are platform-independent.
 * Does not follow symlinks.
 */
async function listRuleFilesRecursive(rulesDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (relDir: string): Promise<void> => {
    const abs = path.join(rulesDir, relDir);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) {
        continue;
      }
      if (ent.isSymbolicLink()) {
        continue;
      }
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        await walk(rel);
      } else if (ent.isFile()) {
        out.push(rel);
      }
    }
  };
  await walk("");
  return out;
}

/**
 * Remove files in the rules folder that are not part of the bundle (including
 * evolved one-off rules). Walks recursively so subfolder entries are checked
 * against manifest paths.
 */
async function deleteUnshippedFiles(
  rulesDir: string,
  manifest: BundleManifest
): Promise<void> {
  if (!(await pathExists(rulesDir))) {
    return;
  }
  const all = await listRuleFilesRecursive(rulesDir);
  for (const rel of all) {
    if (isShippedRuleFile(rel, manifest)) {
      continue;
    }
    if (!isSafeManifestEntry(rel)) {
      // Unexpected on-disk filename—skip rather than risk an out-of-tree rm.
      continue;
    }
    const target = path.join(rulesDir, rel);
    assertContainedPath(rulesDir, target, "rules directory");
    await fs.rm(target, { force: true });
  }
}

export async function resetRulesDirToBundle(
  bundleDir: string,
  rulesDir: string,
  manifest: BundleManifest
): Promise<void> {
  assertSafeDeletionTarget(rulesDir, RULES_DIR_SEGMENTS, "workspace rules folder");
  await fs.mkdir(path.dirname(rulesDir), { recursive: true });
  await fs.rm(rulesDir, { recursive: true, force: true });
  await copyTreeWithoutSymlinks(bundleDir, rulesDir);
  await setRuleEnabled(rulesDir, EVOLVE_RULE, false);
  await deleteUnshippedFiles(rulesDir, manifest);
}

/**
 * Cline reads flat Markdown files from `.clinerules/<subdir>/`, so we collapse
 * any subfolders in the manifest path into the filename to avoid collisions.
 */
function clineMirrorName(manifestPath: string): string {
  const withoutExt = manifestPath.replace(/\.mdc$/i, "");
  const flattened = withoutExt.replace(/\//g, "-");
  return `ai-rules-${flattened}.md`;
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
    const { srcPath } = await resolveBundledRuleSource(bundleDir, mdc);
    const destName = clineMirrorName(mdc);
    if (!isSafeManifestEntry(destName)) {
      throw new Error(`Refusing unsafe Cline mirror filename: ${destName}`);
    }
    const destPath = path.join(dest, destName);
    assertContainedPath(dest, destPath, "Cline rules directory");
    const body = await fs.readFile(srcPath, "utf8");
    await fs.writeFile(destPath, body, "utf8");
  }
}
