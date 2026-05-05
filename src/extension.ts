import * as path from "node:path";
import * as vscode from "vscode";
import { isClineInstalled } from "./cline";
import {
  isCursorHost,
  readCursorInstallPolicy,
  shouldAutoInstallCursorRules,
} from "./cursor";
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
const NON_CURSOR_NOTICE_KEY = "aiRules.nonCursorHostNoticeShown";

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
      `AI Rulebook: failed to load bundled rules — ${reason}. Reinstall the extension or rebuild the bundle.`
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
              "AI Rulebook: Cline detected—synced rules to `.clinerules/ai-rules/`."
            );
          });
        }
      }
      clineWasInstalled = now;
    })
  );

  /**
   * Shows a one-time hint when the user is on a non-Cursor host and the
   * `installCursorRulesFolder` policy resolved to "skip the auto-install".
   * Persisted via `globalState` so the toast never repeats per-machine
   * regardless of how many workspaces are opened. Manual install / reset
   * commands work irrespective of this banner.
   */
  const maybeShowNonCursorNotice = async (): Promise<void> => {
    if (readCursorInstallPolicy() !== "auto") {
      return;
    }
    if (isCursorHost()) {
      return;
    }
    const alreadyShown = context.globalState.get<boolean>(NON_CURSOR_NOTICE_KEY) === true;
    if (alreadyShown) {
      return;
    }
    await context.globalState.update(NON_CURSOR_NOTICE_KEY, true);
    const pick = await vscode.window.showInformationMessage(
      `AI Rulebook: detected ${vscode.env.appName} (not Cursor). Skipping the .cursor/rules/ai-rules/ auto-install. ` +
        `Run "AI Rulebook: Install / update rules in workspace" if you want it anyway, or set ` +
        `"aiRules.installCursorRulesFolder" to "always" to disable this check.`,
      "Install now",
      "Open setting",
      "Dismiss"
    );
    if (pick === "Install now") {
      await vscode.commands.executeCommand("aiRules.installWorkspace");
    } else if (pick === "Open setting") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "aiRules.installCursorRulesFolder"
      );
    }
  };

  /**
   * Idempotent first-time install: if the workspace has no `.cursor/rules/ai-rules`
   * yet, drop the bundled defaults in and start the project in Build mode
   * (`role-developer` on; other roles + test rules off; lightweight coding +
   * rules-for-rules off per Build profile). Existing rules folders
   * are left untouched so the user never gets a surprise overwrite—use the
   * explicit "Install / update" or "Reset" commands for that.
   *
   * Gated by `aiRules.installCursorRulesFolder`:
   *   - "auto"   (default): install only when the host is Cursor.
   *   - "always": install regardless of host (useful when committing the
   *               folder for Cursor-using teammates while editing in plain
   *               VS Code).
   *   - "never":  never auto-install. Manual commands still work.
   *
   * Cline mirroring runs independently and is gated by its own setting plus
   * the Cline-installed check, so a Cline user on plain VS Code still gets
   * `.clinerules/ai-rules/` even if `.cursor/rules/` is skipped here.
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

    const writeCursorRules = shouldAutoInstallCursorRules();
    const wantCline =
      getAiRulesBoolean("autoSyncClineWhenInstalled", true) && isClineInstalled();

    if (!writeCursorRules) {
      // Cline still mirrors independently; only skip the .cursor/ install.
      if (wantCline) {
        await syncBundledMdcsToClinerules(root, bundleDir, manifest);
        vscode.window.showInformationMessage(
          "AI Rulebook: synced bundled rules to `.clinerules/ai-rules/`. " +
            "Skipped `.cursor/rules/ai-rules/` (host is not Cursor — change " +
            "`aiRules.installCursorRulesFolder` to `always` to install anyway)."
        );
      }
      await maybeShowNonCursorNotice();
      treeProvider.refresh();
      return;
    }

    await installBundleToRulesDir(bundleDir, rulesDir, manifest, {
      applyEvolveOffUnlessWasEnabled: true,
    });
    await applyModeProfile(rulesDir, MODE_PROFILES.build);
    const parts = [
      "AI Rulebook: installed default rules into `.cursor/rules/ai-rules/` and started in Build mode (developer role on).",
    ];
    if (wantCline) {
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
          vscode.window.showErrorMessage(`AI Rulebook: ${msg}`);
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
      "AI Rulebook: installed into `.cursor/rules/ai-rules/`. The evolve rule is off until you enable it.",
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
    vscode.window.showInformationMessage("AI Rulebook: all bundled .mdc rules enabled in this workspace.");
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  register("aiRules.disableAllWorkspace", async () => {
    const root = ensureWorkspace();
    const rulesDir = workspaceRulesDir(root);
    await setAllMdcsEnabled(rulesDir, mdcs, false);
    vscode.window.showInformationMessage("AI Rulebook: all bundled .mdc rules disabled in this workspace.");
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
    vscode.window.showInformationMessage("AI Rulebook: global mirror updated (extension storage).");
  });

  register("aiRules.disableAllGlobal", async () => {
    try {
      await removeGlobalMirror(globalDir);
    } catch {
      /* already gone or refused for safety */
    }
    vscode.window.showInformationMessage("AI Rulebook: global mirror removed.");
  });

  register("aiRules.applyGlobalToWorkspace", async () => {
    const root = ensureWorkspace();
    if (!(await pathExists(globalDir))) {
      throw new Error("Global mirror is empty. Run “AI Rulebook: Enable all rules (global mirror)” first.");
    }
    const rulesDir = workspaceRulesDir(root);
    const evolveWas = await wasEvolveEnabledBeforeCopy(rulesDir);
    await copyManifestFiles(globalDir, rulesDir, manifest);
    await applyEvolveDefaultOff(rulesDir, evolveWas);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      "AI Rulebook: copied global mirror into the workspace rules folder." +
        (clineSynced ? " Cline: synced to `.clinerules/ai-rules/`." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  });

  /**
   * Writes `aiRules.colorRulesInExplorer` to whichever scope is currently
   * overriding the value, so toggling actually flips the *effective* value:
   *
   *   - if the user set it per-folder, update that folder
   *   - else if it's set at the workspace level, update the workspace
   *   - else update the User (Global) scope
   *
   * Without this, "Hide active rules" silently no-ops when a Workspace-level
   * `true` shadows our `Global` write.
   */
  const setColorRulesInExplorer = async (enabled: boolean): Promise<void> => {
    const cfg = vscode.workspace.getConfiguration("aiRules");
    const inspect = cfg.inspect<boolean>("colorRulesInExplorer");
    let target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global;
    if (inspect?.workspaceFolderValue !== undefined) {
      target = vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspect?.workspaceValue !== undefined) {
      target = vscode.ConfigurationTarget.Workspace;
    }
    await cfg.update("colorRulesInExplorer", enabled, target);
  };

  /**
   * Symmetric pair with `aiRules.hideActiveRules`: turns the Explorer green
   * tint back on (idempotent—no-op if already on), refreshes the sidebar,
   * focuses it, and writes a plain-text snapshot to the Output channel.
   */
  register("aiRules.showPackStatus", async () => {
    const root = ensureWorkspace();
    const cfg = vscode.workspace.getConfiguration("aiRules");
    if (cfg.get<boolean>("colorRulesInExplorer", true) !== true) {
      await setColorRulesInExplorer(true);
    }
    explorerColors.refresh();
    treeProvider.refresh();
    await vscode.commands.executeCommand(`${RULES_TREE_VIEW_ID}.focus`);
    await showPackStatusInOutput(rulesOutput, workspaceRulesDir(root), mdcs);
  });

  /**
   * Removes the green / muted-gray tint from rule files in the workbench
   * Explorer by flipping `aiRules.colorRulesInExplorer` to `false`. Writes to
   * whichever scope currently overrides the value (folder > workspace > user)
   * so the *effective* value flips—a Global-only write would be shadowed by
   * a Workspace `true` and the colors would stay. Sidebar coloring is
   * unaffected—the sidebar exists to show on/off state, so removing color
   * there would defeat its purpose.
   */
  register("aiRules.hideActiveRules", async () => {
    await setColorRulesInExplorer(false);
    explorerColors.refresh();
    vscode.window.showInformationMessage(
      "AI Rulebook: Explorer rule colors hidden. Run “AI Rulebook: Show active rules” to bring them back."
    );
  });

  register("aiRules.syncClineWorkspace", async () => {
    const root = ensureWorkspace();
    await syncBundledMdcsToClinerules(root, bundleDir, manifest);
    vscode.window.showInformationMessage(
      "AI Rulebook: wrote Markdown copies under `.clinerules/ai-rules/` (ai-rules-*.md)."
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
      title: "AI Rulebook — toggle one rule",
      placeHolder: "Choose a .mdc rule",
    });
    if (!picked) {
      return;
    }
    const on = await isRuleEnabled(rulesDir, picked.ruleFile);
    await setRuleEnabled(rulesDir, picked.ruleFile, !on);
    vscode.window.showInformationMessage(
      `AI Rulebook: ${picked.ruleFile} is now ${!on ? "enabled" : "disabled"}.`
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
      `AI Rulebook: ${profile.summary}` + (clineSynced ? " Cline mirror updated." : "")
    );
    await showPackStatusInOutput(rulesOutput, rulesDir, mdcs);
    treeProvider.refresh();
  };

  register("aiRules.modePlan", () => applyMode("plan"));
  register("aiRules.modeBuild", () => applyMode("build"));
  register("aiRules.modeTest", () => applyMode("test"));
  register("aiRules.modeLowToken", () => applyMode("lowToken"));

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
      title: "AI Rulebook — pick a single role (others get disabled)",
      placeHolder: "Select the role to frame the assistant's responses",
    });
    if (!picked) {
      return;
    }
    await applyRolePick(rulesDir, picked.ruleFile);
    const clineSynced = await maybeAutoSyncCline(root);
    vscode.window.showInformationMessage(
      `AI Rulebook: role mode — only ${picked.label} is enabled.` +
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
        vscode.window.showWarningMessage("AI Rulebook: open a folder before opening a rule.");
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
          `AI Rulebook: ${rulePath} is not in this workspace yet—run “Install / update rules in workspace” first.`
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
        "AI Rulebook: pick a folder from the sidebar tree first."
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
      `AI Rulebook: ${enabled ? "enabled" : "disabled"} every rule in ${folderName}/.`
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
        vscode.window.showErrorMessage(`AI Rulebook: ${msg}`);
      }
    }),
    vscode.commands.registerCommand("aiRules.disableFolder", async (folderArg) => {
      try {
        await setFolderEnabled(folderArg, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`AI Rulebook: ${msg}`);
      }
    })
  );

  register("aiRules.resetWorkspaceRulesToDefaults", async () => {
    const root = ensureWorkspace();
    const choice = await vscode.window.showWarningMessage(
      "Reset `.cursor/rules/ai-rules` to the AI Rulebook extension defaults?\n\n" +
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
      "AI Rulebook: workspace rules folder reset to defaults." +
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
      `AI Rulebook extension updated to v${current}. Refresh workspace rules from the bundle?`,
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
