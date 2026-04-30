import * as fs from "node:fs";
import * as path from "node:path";

export type BundleManifest = {
  version: number;
  files: string[];
};

export function readBundleManifest(extensionRoot: string): BundleManifest {
  const raw = fs.readFileSync(path.join(extensionRoot, "bundled", "manifest.json"), "utf8");
  return JSON.parse(raw) as BundleManifest;
}

export function listBundledMdcs(manifest: BundleManifest): string[] {
  return manifest.files.filter((f) => f.endsWith(".mdc"));
}
