# AI Rules — Cursor / VS Code extension

Install and manage Wyvern's curated **Cursor project rules** under
`.cursor/rules/ai-rules/` from a single command palette and a sidebar tree.
Optionally mirror the same rules to **Cline**'s `.clinerules/ai-rules/`.

- **Display name:** AI Rules
- **Package id:** `wyvernsystems.wyvern-ai-rules`
- **License:** MIT
- **Source of truth for rules:** [`.cursor/rules/ai-rules/`](./.cursor/rules/ai-rules/)
  (the VSIX ships a byte-identical copy under [`bundled/ai-rules/`](./bundled/ai-rules/))

## What it installs

Rules are organized into five subfolders, mirrored verbatim from this repo into
your workspace:

```text
.cursor/rules/ai-rules/
├── ABOUT_RULES.md
├── coding-rules/            # how to write and ship code
├── documentation-rules/     # how to maintain docs and changelogs
├── role-rules/              # how to frame replies for a given audience
├── rules-for-rules/         # how the rule pack itself is authored and announced
└── test-rules/              # how to design and write tests
```

Read [`bundled/ai-rules/ABOUT_RULES.md`](./bundled/ai-rules/ABOUT_RULES.md) for
the full per-rule reference.

## Quickstart

1. Install the **AI Rules** extension in Cursor (or VS Code).
2. Open a project folder.
3. Open the **AI Rules** sidebar (activity bar → checklist icon) **or** run
   **`AI Rules: Install / update rules in workspace`** from the command palette.
4. Confirm the install — the extension copies the bundled rules to
   `.cursor/rules/ai-rules/` (and to `.clinerules/ai-rules/` when Cline is
   detected, controlled by `aiRules.autoSyncClineWhenInstalled`).
5. Toggle individual rules from the sidebar's checkbox tree, or pick a curated
   preset via **Mode — Plan / Build / Test / Role…**.

## Commands

| Command | What it does |
|---------|--------------|
| **AI Rules: Install / update rules in workspace** | Copies each bundled file into `.cursor/rules/ai-rules/`. Evolve rule starts off unless it was already enabled. Auto-syncs Cline when installed. |
| **AI Rules: Enable / disable all rules (workspace)** | Renames every bundled `.mdc` between active and `.mdc.disabled`. |
| **AI Rules: Enable / disable all rules (global mirror)** | Copies or removes rules under the extension's **global storage** mirror. |
| **AI Rules: Copy global mirror into workspace** | Pushes the mirror into the workspace rules folder; may auto-sync Cline. |
| **AI Rules: Show pack status (green = active)** | Opens the **Output → AI Rules** channel: active rules in **green** (ANSI), disabled in dim text. |
| **AI Rules: Sync bundled rules to Cline** | Manual mirror to `.clinerules/ai-rules/`. |
| **AI Rules: Enable or disable a single rule…** | QuickPick to toggle one `.mdc`. |
| **AI Rules: Reset workspace rules folder to defaults…** | Replaces from bundle, deletes extras, evolve off; may auto-sync Cline. |
| **AI Rules: Mode — Plan** | Enables `role-architect`; disables other roles and all test rules. |
| **AI Rules: Mode — Build** | Enables `role-developer`; disables other roles and all test rules. |
| **AI Rules: Mode — Test** | Enables `role-tester` and every `test-rules/*`; disables other roles. |
| **AI Rules: Mode — Role…** | QuickPick to enable a single role; disables the other roles. |

Modes never touch the always-on coding, documentation, or meta rules — they
only flip role and test rules.

## Settings

| Setting | Default | Effect |
|---------|---------|--------|
| `aiRules.promptInstallOnUpdate` | `true` | When the extension version changes, offer to refresh workspace rules from the bundled copy. |
| `aiRules.autoSyncClineWhenInstalled` | `true` | Mirror bundled `.mdc` rules into `.clinerules/ai-rules/` whenever Cline is installed (after install / reset / copy-from-global, and on first detection). |

## Security model

This extension only writes inside three well-known locations:

- the open workspace folder, under `.cursor/rules/ai-rules/` and (when Cline is
  installed) `.clinerules/ai-rules/`;
- the extension's **global storage** under
  `<globalStorage>/ai-rules-mirror/ai-rules/` — used by the global mirror
  commands;
- nothing outside those paths.

Defensive measures applied:

- **Bundled manifest is validated** at activation: each entry must be a
  forward-slash relative path matching `^[A-Za-z0-9_./-]+$`, with no `..`
  segments, no leading `/` or `./`, and ≤ 200 chars. A tampered or malformed
  `bundled/manifest.json` causes a clear error and aborts activation.
- **Path containment**: every operation that resolves a manifest entry under a
  base directory (bundle, workspace rules dir, global mirror) re-checks that
  the resolved path stays inside that base. Out-of-tree paths throw before any
  filesystem call.
- **Destructive operations are gated** by an explicit suffix check. The
  workspace rules folder must end with `.cursor/rules/ai-rules`, the global
  mirror with `ai-rules-mirror/ai-rules`. A misconfigured constant cannot widen
  the blast radius of `rm -rf`.
- **No symlinks during recursive copies**: the `fs.cp` calls used to mirror the
  bundle filter out symbolic links, and the on-disk recursive walker skips
  symlinks too. The shipped VSIX has no symlinks; this is defense in depth in
  case the install directory is tampered with.
- **No network access.** The extension never makes outbound HTTP calls.
- **No runtime dependencies.** `package.json` has zero `dependencies`; only
  `@types/*`, `@vscode/vsce`, and `typescript` as devDependencies. The VSIX
  ships only compiled JS, the bundled rule files, an icon, the readme,
  changelog, and license.
- **No secret material.** The extension never reads or writes credentials,
  environment variables, or anything outside the rule files listed above.

If you find a security issue, please open a private report on the issues
tracker (linked in `package.json → bugs`).

## Develop

```bash
npm install
npm run sync-bundled    # copy .cursor/rules/ai-rules → bundled/ai-rules
npm run verify:bundled  # fail if bundled ≠ source (run after sync)
npm run compile         # tsc → out/
```

Press **F5** with this repo open in VS Code (or Cursor) to launch the
**Extension Development Host** with the dev build.

The **source of truth** for rule text is `.cursor/rules/ai-rules/`. The VSIX
ships `bundled/ai-rules/`; the `vscode:prepublish` script runs
**sync → verify → compile** to keep them identical.

## Package the VSIX (for the marketplace)

```bash
npm install
npm run sync-bundled
npm run verify:bundled
npm run compile
npx --no-install vsce package
```

This produces `wyvern-ai-rules-<version>.vsix` in the repo root. To upload it
to the [VS Code Marketplace](https://marketplace.visualstudio.com/manage):

1. Sign in as the publisher (`wyvernsystems`).
2. Choose **New extension → Visual Studio Code**.
3. Upload the `.vsix`.

For the [Open VSX](https://open-vsx.org/) registry (used by Cursor's gallery),
follow [their publishing guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).

## Notes

- Cursor **user rules** (app-wide) still live in **Cursor Settings → Rules**;
  this extension's "global mirror" is separate per-extension storage unless you
  copy it into a workspace.
- Cline may interpret YAML (`globs` vs `paths`) differently from Cursor; treat
  Cline output as best-effort.

### If "Active project rules" never appears in chat

- Confirm `rules-for-rules/state-active-project-rules-in-prompt-response.mdc`
  is not disabled — the AI Rules extension may have renamed it to
  `.mdc.disabled`. Use **AI Rules: Enable all rules (workspace)** or toggle it
  back on from the sidebar.
- In **Cursor Settings → Rules**, confirm project rules for this workspace are
  not turned off.
- Cursor still depends on the **model** following instructions; if it skips
  the block, try `@state-active-project-rules-in-prompt-response` once in the
  thread.
