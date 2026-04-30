import * as vscode from "vscode";
import { isRuleEnabled } from "./rulesOperations";

/** ANSI: green / dim for Output panel (supported in VS Code’s text output). */
const GREEN = "\x1b[32m";
const DIM = "\x1b[90m";
const RESET = "\x1b[0m";

export function createAiRulesOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel("AI Rules");
}

export async function showPackStatusInOutput(
  channel: vscode.OutputChannel,
  rulesDir: string,
  mdcs: readonly string[]
): Promise<void> {
  channel.clear();
  channel.show(true);
  channel.appendLine("AI Rules — `.cursor/rules/ai-rules` pack");
  channel.appendLine("");
  for (const f of mdcs) {
    const on = await isRuleEnabled(rulesDir, f);
    if (on) {
      channel.appendLine(`${GREEN}active${RESET}\t${f}`);
    } else {
      channel.appendLine(`${DIM}off${RESET}\t\t${f}`);
    }
  }
  channel.appendLine("");
  channel.appendLine(`${GREEN}active${RESET} = loaded by Cursor; ${DIM}off${RESET} = \`.mdc.disabled\` on disk.`);
}

export function quickPickIconsForRule(enabled: boolean): vscode.ThemeIcon | undefined {
  if (enabled) {
    return new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
  }
  return new vscode.ThemeIcon("circle-slash", new vscode.ThemeColor("testing.iconFailed"));
}
