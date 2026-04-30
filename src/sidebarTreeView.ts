import * as vscode from "vscode";
import type { BundleManifest } from "./manifest";
import { isRuleEnabled, setRuleEnabled, workspaceRulesDir } from "./rulesOperations";

/** ID must match the view contributed in package.json. */
export const RULES_TREE_VIEW_ID = "aiRules.rulesTree";

/**
 * Synthetic URI scheme used to attach decoration state to rule TreeItems.
 * The path is `/on/<rule-path>` for active rules and `/off/<rule-path>` for
 * disabled ones, so the FileDecorationProvider can look at the path alone.
 */
const RULE_STATUS_SCHEME = "ai-rules-status";

type FolderItem = {
  kind: "folder";
  folder: string;
};

type RuleItem = {
  kind: "rule";
  ruleFile: string; // forward-slash relative path from manifest
};

type Node = FolderItem | RuleItem;

function folderOf(rulePath: string): string {
  const slash = rulePath.indexOf("/");
  return slash === -1 ? "" : rulePath.slice(0, slash);
}

function leafName(rulePath: string): string {
  const slash = rulePath.lastIndexOf("/");
  const base = slash === -1 ? rulePath : rulePath.slice(slash + 1);
  return base.replace(/\.mdc$/i, "");
}

function ruleStatusUri(ruleFile: string, enabled: boolean): vscode.Uri {
  return vscode.Uri.from({
    scheme: RULE_STATUS_SCHEME,
    path: `/${enabled ? "on" : "off"}/${ruleFile}`,
  });
}

/**
 * Colors rule labels in the sidebar tree:
 *   - active rules → `testing.iconPassed` (green in default themes)
 *   - disabled rules → `disabledForeground` (muted)
 * Stateless: the URI path encodes the on/off state, so refreshing the tree
 * (which rebuilds resource URIs) updates colors without provider state.
 */
export class RuleStatusDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<undefined>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== RULE_STATUS_SCHEME) {
      return undefined;
    }
    const isActive = uri.path.startsWith("/on/");
    if (isActive) {
      return {
        color: new vscode.ThemeColor("testing.iconPassed"),
        tooltip: "Active — loaded by Cursor",
      };
    }
    return {
      color: new vscode.ThemeColor("disabledForeground"),
      tooltip: "Disabled — `.mdc.disabled` on disk",
    };
  }
}

/**
 * Tree data provider that lists each shipped rule grouped by its top-level
 * subfolder in the manifest. Each rule row uses VS Code's TreeItem checkbox so
 * the user can flip rules on / off without leaving the sidebar.
 */
export class RulesTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private readonly mdcs: readonly string[];
  private readonly folders: readonly string[];
  /**
   * Callbacks fired after every tree refresh. Lets sibling decoration
   * providers (sidebar colors, Explorer colors) re-publish without each
   * call site having to know about them.
   */
  private readonly afterRefresh: Array<() => void> = [];

  constructor(manifest: BundleManifest) {
    this.mdcs = manifest.files.filter((f) => f.endsWith(".mdc"));
    const seen = new Set<string>();
    for (const f of this.mdcs) {
      const folder = folderOf(f);
      if (folder) {
        seen.add(folder);
      }
    }
    this.folders = [...seen].sort();
  }

  onAfterRefresh(cb: () => void): void {
    this.afterRefresh.push(cb);
  }

  refresh(): void {
    this._onDidChange.fire(undefined);
    for (const cb of this.afterRefresh) {
      cb();
    }
  }

  getTreeItem(node: Node): Promise<vscode.TreeItem> {
    if (node.kind === "folder") {
      return Promise.resolve(this.folderTreeItem(node));
    }
    return this.ruleTreeItem(node);
  }

  getChildren(parent?: Node): Promise<Node[]> {
    if (!parent) {
      return Promise.resolve(
        this.folders.map((folder): Node => ({ kind: "folder", folder }))
      );
    }
    if (parent.kind === "folder") {
      const inFolder = this.mdcs
        .filter((f) => folderOf(f) === parent.folder)
        .sort()
        .map((ruleFile): Node => ({ kind: "rule", ruleFile }));
      return Promise.resolve(inFolder);
    }
    return Promise.resolve([]);
  }

  private folderTreeItem(node: FolderItem): vscode.TreeItem {
    const item = new vscode.TreeItem(node.folder, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = "aiRulesFolder";
    item.iconPath = new vscode.ThemeIcon("folder");
    item.tooltip = `Right-click to enable / disable every rule in ${node.folder}.`;
    return item;
  }

  private async ruleTreeItem(node: RuleItem): Promise<vscode.TreeItem> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const enabled = root ? await isRuleEnabled(workspaceRulesDir(root), node.ruleFile) : false;
    const item = new vscode.TreeItem(leafName(node.ruleFile), vscode.TreeItemCollapsibleState.None);
    item.description = enabled ? "active" : "off";
    item.tooltip = `${node.ruleFile}\n\nClick the checkbox to toggle.`;
    item.contextValue = enabled ? "aiRulesRuleEnabled" : "aiRulesRuleDisabled";
    item.checkboxState = enabled
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.iconPath = new vscode.ThemeIcon(
      enabled ? "pass-filled" : "circle-outline",
      new vscode.ThemeColor(enabled ? "testing.iconPassed" : "descriptionForeground")
    );
    item.resourceUri = ruleStatusUri(node.ruleFile, enabled);
    item.command = {
      command: "aiRules.revealRuleFile",
      title: "Open rule file",
      arguments: [node.ruleFile],
    };
    return item;
  }

  /** All rules under a folder (forward-slash relative paths). */
  rulesInFolder(folder: string): readonly string[] {
    return this.mdcs.filter((f) => folderOf(f) === folder);
  }
}

/**
 * Wires the tree view to checkbox events: a single click on a checkbox flips
 * the rule's `.mdc` ↔ `.mdc.disabled` rename. A workspace must be open—if not,
 * we surface a friendly hint instead of silently failing.
 */
export function bindRulesTreeView(
  context: vscode.ExtensionContext,
  provider: RulesTreeProvider,
  afterChange: () => Promise<void>
): vscode.TreeView<Node> {
  const view = vscode.window.createTreeView<Node>(RULES_TREE_VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  view.onDidChangeCheckboxState(async (e) => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showWarningMessage("AI Rules: open a folder before toggling rules.");
      provider.refresh();
      return;
    }
    const rulesDir = workspaceRulesDir(root);
    for (const [node, state] of e.items) {
      if (node.kind !== "rule") {
        continue;
      }
      const enable = state === vscode.TreeItemCheckboxState.Checked;
      try {
        await setRuleEnabled(rulesDir, node.ruleFile, enable);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`AI Rules: ${node.ruleFile} — ${msg}`);
      }
    }
    await afterChange();
    provider.refresh();
  });

  context.subscriptions.push(view);
  return view;
}
