import * as path from "node:path";
import * as vscode from "vscode";
import { isClineInstalled } from "./cline";
import { listBundledMdcs, readBundleManifest, type BundleManifest } from "./manifest";
import {
  applyModeProfile,
  applyRolePick,
  MODE_PROFILES,
  ROLE_RULES,
  type Mode,
} from "./modes";
import {
  createAiRulesOutputChannel,
  quickPickIconsForRule,
  showPackStatusInOutput,
} from "./ruleStatusUi";
import {
  applyEvolveDefaultOff,
  copyManifestFiles,
  globalMirrorDir,
  installBundleToRulesDir,
  isRuleEnabled,
  pathExists,
  removeGlobalMirror,
  replaceGlobalMirror,
  resetRulesDirToBundle,
  setAllMdcsEnabled,
  setRuleEnabled,
  syncBundledMdcsToClinerules,
  wasEvolveEnabledBeforeCopy,
  workspaceRulesDir,
} from "./rulesOperations";
import { assertContainedPath, isSafeManifestEntry } from "./safePaths";
import { COLOR_RULES_IN_EXPLORER_SETTING, WorkspaceRuleFileColorer } from "./explorerDecorations";
import {
  bindRulesTreeView,
  RuleStatusDecorationProvider,
  RulesTreeProvider,
  RULES_TREE_VIEW_ID,
} from "./sidebarTreeView";

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
  let manifest: BundleManifest;
  try {
    manifest = readBundleManifest(extensionRoot);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(
      `AI Rules: failed to load bundled rules — ${reason}. Reinstall the extension or rebuild the bundle.`
    );
    return;
  }

  const mdcs = listBundledMdcs(manifest);
  const globalDir = globalMirrorDir(context.globalStorageUri.fsPath);
  const rulesOutput = createAiRulesOutputChannel();
  context.subscriptions.push(rulesOutput);

  const sidebarColors = new RuleStatusDecorationProvider();
  const explorerColors = new WorkspaceRuleFileColorer();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(sidebarColors),
    vscode.window.registerFileDecorationProvider(explorerColors),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(COLOR_RULES_IN_EXPLORER_SETTING)) {
        explorerColors.refresh();
      }
    })
  );

  const treeProvider = new RulesTreeProvider(manifest);
  treeProvider.onAfterRefresh(() => sidebarColors.refresh());
  treeProvider.onAfterRefresh(() => explorerColors.refresh());
  /**
   * Refresh handle used after every action that changes rule state on disk.
   * `treeProvider.refresh()` also fires every registered decoration provider
   * via `onAfterRefresh`, so call sites only need to refresh the tree.
   */
  const refreshSidebar = (): Promise<void> => {
    treeProvider.refresh();
    return Promise.resolve();
  };
  bindRulesTreeView(context, treeProvider, refreshSidebar);

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

  /**
   * Idempotent first-time install: if the workspace has no `.cursor/rules/ai-rules`
   * yet, drop the bundled defaults in and start the project in Build mode
   * (`role-developer` on, other roles + test rules off). Existing rules folders
   * are left untouched so the user never gets a surprise overwrite—use the
   * explicit "Install / update" or "Reset" commands for that.
   */
  const autoInstallIfMissing = async (): Promise<void> => {
    if (!getAiRulesBoolean("autoInstallOnOpenWorkspace", true)) {
      return;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return;
    }
    const rulesDir = workspaceRulesDir(root);
    if (await pathExists(rulesDir)) {
      return;
    }
    if (!(await pathExists(bundleDir))) {
      return;
    }
    await installBundleToRulesDir(bundleDir, rulesDir, manifest, {
      applyEvolveOffUnlessWasEnabled: true,
    });
    await applyModeProfile(rulesDir, MODE_PROFILES.build);
    const parts = [
      "AI Rules: installed default rules into `.cursor/rules/ai-rules/` and started in Build mode (developer role on).",
    ];
    if (getAiRulesBoolean("autoSyncClineWhenInstalled", true) && isClineInstalled()) {
      await syncBundledMdcsToClinerules(root, bundleDir, manifest);
      parts.push("Cline: synced to `.clinerules/ai-rules/`.");
    }
    vscode.window.showInformationMessage(parts.join(" "));
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void autoInstallIfMissing();
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
    treeProvider.refresh();
  });

  register("aiRules.enableAllWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    await setAllMdcsEnabled(rulesDir, mdcs, true);
    vscode.window.showInformationMessage("AI Rules: all bundled .mdc rules enabled in this workspace.");
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  register("aiRules.disableAllWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    await setAllMdcsEnabled(rulesDir, mdcs, false);
    vscode.window.showInformationMessage("AI Rules: all bundled .mdc rules disabled in this workspace.");
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  register("aiRules.enableAllGlobal", async () => {
    if (!(await pathExists(bundleDir))) {
      throw new Error(`Missing bundle at ${bundleDir}`);
    }
    const evolveWas = await wasEvolveEnabledBeforeCopy(globalDir);
    await replaceGlobalMirror(globalDir, bundleDir);
    await applyEvolveDefaultOff(globalDir, evolveWas);
    vscode.window.showInformationMessage("AI Rules: global mirror updated (extension storage).");
  });

  register("aiRules.disableAllGlobal", async () => {
    try {
      await removeGlobalMirror(globalDir);
    } catch {
      /* already gone or refused for safety */
    }
    vscode.window.showInformationMessage("AI Rules: global mirror removed.");
  });

  register("aiRules.applyGlobalToWorkspace", async () => {
    const root = ensureWorkspace();
    if (!(await pathExists(globalDir))) {
      throw new Error("Global mirror is empty. Run “AI Rules: Enable all rules (global mirror)” first.");
    }
    const rulesDir = workspaceRulesDir(root);
    const evolveWas = await wasEvolveEnabledBeforeCopy(rulesDir);
    await copyManifestFiles(globalDir, rulesDir, manifest);
    await applyEvolveDefaultOff(rulesDir, evolveWas);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      "AI Rules: copied global mirror into the workspace rules folder." +
        (clineSynced ? " Cline: synced to `.clinerules/ai-rules/`." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  /**
   * Symmetric pair with `aiRules.hideActiveRules`: turns the Explorer green
   * tint back on (idempotent—no-op if already on), refreshes the sidebar,
   * focuses it, and writes a plain-text snapshot to the Output channel.
   */
  register("aiRules.showPackStatus", async () => {
    const root = ensureWorkspace();
    const cfg = vscode.workspace.getConfiguration("aiRules");
    if (cfg.get<boolean>("colorRulesInExplorer", true) !== true) {
      await cfg.update("colorRulesInExplorer", true, vscode.ConfigurationTarget.Global);
    }
    treeProvider.refresh();
    await vscode.commands.executeCommand(`${RULES_TREE_VIEW_ID}.focus`);
    await showPackStatusInOutput(rulesOutput, workspaceRulesDir(root), mdcs);
  });

  /**
   * Removes the green / muted-gray tint from rule files in the workbench
   * Explorer by flipping `aiRules.colorRulesInExplorer` to `false` at the
   * Global scope. Sidebar coloring is unaffected—the sidebar exists to show
   * on/off state, so removing color there would defeat its purpose.
   */
  register("aiRules.hideActiveRules", async () => {
    const cfg = vscode.workspace.getConfiguration("aiRules");
    await cfg.update("colorRulesInExplorer", false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      "AI Rules: Explorer rule colors hidden. Run “AI Rules: Show active rules” to bring them back."
    );
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
    treeProvider.refresh();
  });

  const applyMode = async (mode: Mode): Promise<void> => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    const profile = MODE_PROFILES[mode];
    await applyModeProfile(rulesDir, profile);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      `AI Rules: ${profile.summary}` + (clineSynced ? " Cline mirror updated." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  };

  register("aiRules.modePlan", () => applyMode("plan"));
  register("aiRules.modeBuild", () => applyMode("build"));
  register("aiRules.modeTest", () => applyMode("test"));

  register("aiRules.modeRole", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    type RolePick = vscode.QuickPickItem & { ruleFile: string };
    const items: RolePick[] = [];
    for (const ruleFile of ROLE_RULES) {
      const on = await isRuleEnabled(rulesDir, ruleFile);
      const label = ruleFile.replace(/^role-rules\//, "").replace(/\.mdc$/, "");
      items.push({
        label,
        description: on ? "Currently active" : "",
        detail: ruleFile,
        iconPath: quickPickIconsForRule(on),
        ruleFile,
      });
    }
    const picked = await vscode.window.showQuickPick(items, {
      title: "AI Rules — pick a single role (others get disabled)",
      placeHolder: "Select the role to frame the assistant's responses",
    });
    if (!picked) {
      return;
    }
    await applyRolePick(rulesDir, picked.ruleFile);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      `AI Rules: role mode — only ${picked.label} is enabled.` +
        (clineSynced ? " Cline mirror updated." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  register("aiRules.refreshTree", async () => {
    treeProvider.refresh();
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("aiRules.revealRuleFile", async (rulePath?: string) => {
      if (typeof rulePath !== "string" || !isSafeManifestEntry(rulePath)) {
        return;
      }
      if (!manifest.files.includes(rulePath)) {
        return;
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showWarningMessage("AI Rules: open a folder before opening a rule.");
        return;
      }
      const rulesDir = workspaceRulesDir(root);
      const enabledPath = path.join(rulesDir, rulePath);
      const disabledPath = `${enabledPath}.disabled`;
      assertContainedPath(rulesDir, enabledPath, "rules directory");
      const target = (await pathExists(enabledPath))
        ? enabledPath
        : (await pathExists(disabledPath))
          ? disabledPath
          : null;
      if (!target) {
        vscode.window.showWarningMessage(
          `AI Rules: ${rulePath} is not in this workspace yet—run “Install / update rules in workspace” first.`
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );

  type FolderTreeNode = { kind: "folder"; folder: string };
  const setFolderEnabled = async (
    folderArg: FolderTreeNode | string | undefined,
    enabled: boolean
  ): Promise<void> => {
    const folderName =
      typeof folderArg === "string"
        ? folderArg
        : folderArg && folderArg.kind === "folder"
          ? folderArg.folder
          : undefined;
    if (!folderName) {
      vscode.window.showWarningMessage(
        "AI Rules: pick a folder from the sidebar tree first."
      );
      return;
    }
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    const rules = treeProvider.rulesInFolder(folderName);
    if (rules.length === 0) {
      return;
    }
    for (const r of rules) {
      await setRuleEnabled(rulesDir, r, enabled);
    }
    vscode.window.showInformationMessage(
      `AI Rules: ${enabled ? "enabled" : "disabled"} every rule in ${folderName}/.`
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("aiRules.enableFolder", async (folderArg) => {
      try {
        await setFolderEnabled(folderArg, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`AI Rules: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("aiRules.disableFolder", async (folderArg) => {
      try {
        await setFolderEnabled(folderArg, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`AI Rules: ${msg}`);
      }
    })
  );

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
    treeProvider.refresh();
  });

  await autoInstallIfMissing();

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
