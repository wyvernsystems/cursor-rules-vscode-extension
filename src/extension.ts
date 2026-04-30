import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { isClineInstalled } from "./cline";
import { listBundledMdcs, readBundleManifest } from "./manifest";
import { createAiRulesOutputChannel, quickPickIconsForRule, showPackStatusInOutput } from "./ruleStatusUi";
import {
  applyEvolveDefaultOff,
  globalMirrorDir,
  installBundleToRulesDir,
  isRuleEnabled,
  pathExists,
  resetRulesDirToBundle,
  setAllMdcsEnabled,
  setRuleEnabled,
  syncBundledMdcsToClinerules,
  wasEvolveEnabledBeforeCopy,
  workspaceRulesDir,
} from "./rulesOperations";

const LAST_SEEN_VERSION_KEY = "aiRules.lastSeenExtensionVersion";

function getAiRulesBoolean(key: string, defaultValue: boolean): boolean {
  const v = vscode.workspace.getConfiguration("aiRules").get(key);
  if (typeof v === "boolean") {
    return v;
  }
  return defaultValue;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extensionRoot = context.extensionPath;
  const bundleDir = path.join(extensionRoot, "bundled", "ai-rules");
  let manifest;
  try {
    manifest = readBundleManifest(extensionRoot);
  } catch {
    vscode.window.showErrorMessage(
      "AI Rules: bundled copy is missing. Run `npm run sync-bundled` from the extension repo, then reload."
    );
    return;
  }

  const mdcs = listBundledMdcs(manifest);
  const globalDir = globalMirrorDir(context.globalStorageUri.fsPath);
  const rulesOutput = createAiRulesOutputChannel();
  context.subscriptions.push(rulesOutput);

  const ensureWorkspace = (): string => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      throw new Error("Open a folder in VS Code first.");
    }
    return folder;
  };

  /** Returns true if Cline mirror was written. */
  const maybeAutoSyncCline = async (root: string): Promise<boolean> => {
    if (!getAiRulesBoolean("autoSyncClineWhenInstalled", true)) {
      return false;
    }
    if (!isClineInstalled()) {
      return false;
    }
    await syncBundledMdcsToClinerules(root, bundleDir, manifest);
    return true;
  };

  let clineWasInstalled = isClineInstalled();
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const now = isClineInstalled();
      if (now && !clineWasInstalled && getAiRulesBoolean("autoSyncClineWhenInstalled", true)) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
          void syncBundledMdcsToClinerules(root, bundleDir, manifest).then(() => {
            vscode.window.showInformationMessage(
              "AI Rules: Cline detected—synced rules to `.clinerules/ai-rules/`."
            );
          });
        }
      }
      clineWasInstalled = now;
    })
  );

  const register = (command: string, fn: () => Promise<void>) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        try {
          await fn();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          vscode.window.showErrorMessage(`AI Rules: ${msg}`);
        }
      })
    );
  };

  register("aiRules.installWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    if (!(await pathExists(bundleDir))) {
      throw new Error(`Missing bundle at ${bundleDir}`);
    }
    await installBundleToRulesDir(bundleDir, rulesDir, manifest, {
      applyEvolveOffUnlessWasEnabled: true,
    });
    const parts = [
      "AI Rules: installed into `.cursor/rules/ai-rules/`. The evolve rule is off until you enable it.",
    ];
    if (getAiRulesBoolean("autoSyncClineWhenInstalled", true) && isClineInstalled()) {
      await syncBundledMdcsToClinerules(root, bundleDir, manifest);
      parts.push("Cline: synced to `.clinerules/ai-rules/`.");
    }
    vscode.window.showInformationMessage(parts.join(" "));
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
  });

  register("aiRules.enableAllWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    await setAllMdcsEnabled(rulesDir, mdcs, true);
    vscode.window.showInformationMessage("AI Rules: all bundled .mdc rules enabled in this workspace.");
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
  });

  register("aiRules.disableAllWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    await setAllMdcsEnabled(rulesDir, mdcs, false);
    vscode.window.showInformationMessage("AI Rules: all bundled .mdc rules disabled in this workspace.");
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
  });

  register("aiRules.enableAllGlobal", async () => {
    if (!(await pathExists(bundleDir))) {
      throw new Error(`Missing bundle at ${bundleDir}`);
    }
    const evolveWas = await wasEvolveEnabledBeforeCopy(globalDir);
    await fs.mkdir(path.dirname(globalDir), { recursive: true });
    await fs.rm(globalDir, { recursive: true, force: true });
    await fs.cp(bundleDir, globalDir, { recursive: true });
    await applyEvolveDefaultOff(globalDir, evolveWas);
    vscode.window.showInformationMessage("AI Rules: global mirror updated (extension storage).");
  });

  register("aiRules.disableAllGlobal", async () => {
    try {
      await fs.rm(globalDir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
    vscode.window.showInformationMessage("AI Rules: global mirror removed.");
  });

  register("aiRules.applyGlobalToWorkspace", async () => {
    const root = ensureWorkspace();
    if (!(await pathExists(globalDir))) {
      throw new Error("Global mirror is empty. Run “AI Rules: Enable all rules (global mirror)” first.");
    }
    const rulesDir = workspaceRulesDir(root);
    await fs.mkdir(rulesDir, { recursive: true });
    const evolveWas = await wasEvolveEnabledBeforeCopy(rulesDir);
    for (const f of manifest.files) {
      await fs.copyFile(path.join(globalDir, f), path.join(rulesDir, f));
    }
    await applyEvolveDefaultOff(rulesDir, evolveWas);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      "AI Rules: copied global mirror into the workspace rules folder." +
        (clineSynced ? " Cline: synced to `.clinerules/ai-rules/`." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
  });

  register("aiRules.showPackStatus", async () => {
    const root = ensureWorkspace();
    await showPackStatusInOutput(rulesOutput, workspaceRulesDir(root), mdcs);
  });

  register("aiRules.syncClineWorkspace", async () => {
    const root = ensureWorkspace();
    await syncBundledMdcsToClinerules(root, bundleDir, manifest);
    vscode.window.showInformationMessage(
      "AI Rules: wrote Markdown copies under `.clinerules/ai-rules/` (ai-rules-*.md)."
    );
  });

  register("aiRules.toggleIndividualRule", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    type Pick = vscode.QuickPickItem & { ruleFile: string };
    const items: Pick[] = [];
    for (const ruleFile of mdcs) {
      const on = await isRuleEnabled(rulesDir, ruleFile);
      items.push({
        label: ruleFile,
        description: on ? "Enabled (active in Cursor)" : "Disabled (.mdc.disabled)",
        detail: "Enter: toggle",
        iconPath: quickPickIconsForRule(on),
        ruleFile,
      });
    }
    const picked = await vscode.window.showQuickPick(items, {
      title: "AI Rules — toggle one rule",
      placeHolder: "Choose a .mdc rule",
    });
    if (!picked) {
      return;
    }
    const on = await isRuleEnabled(rulesDir, picked.ruleFile);
    await setRuleEnabled(rulesDir, picked.ruleFile, !on);
    vscode.window.showInformationMessage(
      `AI Rules: ${picked.ruleFile} is now ${!on ? "enabled" : "disabled"}.`
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
  });

  register("aiRules.resetWorkspaceRulesToDefaults", async () => {
    const root = ensureWorkspace();
    const choice = await vscode.window.showWarningMessage(
      "Reset `.cursor/rules/ai-rules` to the AI Rules extension defaults?\n\n" +
        "• All files in that folder will be replaced from the bundled copy.\n" +
        "• Any extra rule files you added there (evolved rules) will be deleted.\n" +
        "• The evolve-rules rule will be turned off again by default.\n" +
        "• Unsaved or uncommitted edits in that folder may be lost—commit or stash first if needed.",
      { modal: true },
      "Reset to defaults",
      "Cancel"
    );
    if (choice !== "Reset to defaults") {
      return;
    }
    await resetRulesDirToBundle(bundleDir, workspaceRulesDir(root), manifest);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      "AI Rules: workspace rules folder reset to defaults." +
        (clineSynced ? " Cline: synced to `.clinerules/ai-rules/`." : "")
    );
    await showPackStatusInOutput(rulesOutput, workspaceRulesDir(root), mdcs);
  });

  const current = context.extension.packageJSON.version as string;
  const prev = context.globalState.get<string>(LAST_SEEN_VERSION_KEY);
  if (
    getAiRulesBoolean("promptInstallOnUpdate", true) &&
    prev &&
    prev !== current &&
    vscode.workspace.workspaceFolders?.length
  ) {
    const pick = await vscode.window.showInformationMessage(
      `AI Rules extension updated to v${current}. Refresh workspace rules from the bundle?`,
      "Install / update in workspace",
      "Not now"
    );
    if (pick === "Install / update in workspace") {
      await vscode.commands.executeCommand("aiRules.installWorkspace");
    }
  }
  await context.globalState.update(LAST_SEEN_VERSION_KEY, current);
}

export function deactivate(): void {}
