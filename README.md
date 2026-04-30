# AI Rules (VS Code extension)

**Display name:** AI Rules · **Package id:** `wyvernsystems.wyvern-ai-rules` (see `package.json`).

Installs Wyvern’s Cursor project rules into **`.cursor/rules/ai-rules/`** (same layout as this repo under `.cursor/rules/ai-rules/`). Rules are shipped from **`bundled/ai-rules/`**, produced from that folder by `npm run sync-bundled`.

When **Cline** is installed (`saoudrizwan.claude-dev` or `saoudrizwan.cline-nightly`) and **`aiRules.autoSyncClineWhenInstalled`** is enabled (default **on**), the extension also mirrors bundled `.mdc` files into **`.clinerules/ai-rules/`** as `ai-rules-*.md` after workspace install, reset, copy-from-global, and when Cline is first detected.

## Commands

| Command | What it does |
|--------|----------------|
| **Install / update rules in workspace** | Copies each bundled file into `.cursor/rules/ai-rules/`. Evolve rule is off by default unless it was already enabled. Auto-syncs Cline folder when Cline is installed and setting is on. |
| **Enable / disable all rules (workspace)** | Renames every bundled `.mdc` between active and `.mdc.disabled`. |
| **Enable / disable all rules (global mirror)** | Copies or removes rules under the extension’s **global storage** mirror. |
| **Copy global mirror into workspace** | Pushes the mirror into the workspace rules folder; may auto-sync Cline. |
| **Show pack status (green = active)** | Opens the **Output → AI Rules** channel: active rules in **green** (ANSI), disabled in dim text. Runs automatically after install/toggle/reset when relevant. |
| **Sync bundled rules to Cline** | Manual mirror to `.clinerules/ai-rules/`. |
| **Enable or disable a single rule…** | Quick pick to toggle one `.mdc`. |
| **Reset workspace rules folder to defaults…** | Replaces from bundle, deletes extra files, evolve off again; may auto-sync Cline. |

## Develop

```bash
npm install
npm run sync-bundled   # copy .cursor/rules/ai-rules → bundled/ai-rules
npm run verify:bundled # fail if bundled ≠ source (run after sync)
npm run compile
```

**Source of truth** for rule text is **`.cursor/rules/ai-rules/`**. The VSIX ships **`bundled/ai-rules/`**; `vscode:prepublish` runs **sync → verify → compile** so they stay identical.

Press **F5** with this repo open to run the Extension Development Host.

## Package

```bash
npm run vscode:prepublish
npx vsce package
```

## Notes

- Cursor **user rules** (app-wide) still live in Cursor Settings → Rules; this extension’s “global mirror” is separate storage unless you copy it into a workspace.
- Cline may interpret YAML (`globs` vs `paths`) differently from Cursor; treat Cline output as best-effort.

### If “Active project rules” never appears in chat

- Confirm **`state-active-project-rules.mdc`** is not disabled: the AI Rules extension may have renamed it to **`.mdc.disabled`**—use **AI Rules: Enable all rules (workspace)** or toggle that rule on.
- In **Cursor Settings → Rules**, ensure project rules for this workspace are not turned off.
- Cursor still depends on the **model** following instructions; if it skips the block, try **`@state-active-project-rules`** once in the thread.
