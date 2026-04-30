# Requirements

This document captures the working requirements, constraints, and non-goals
for the **AI Rules** extension. Short, testable bullets only — implementation
details belong in the code or in the rule files.

## Functional

- The extension installs a curated pack of Cursor project rules into
  `.cursor/rules/ai-rules/` of the open workspace.
- On activation (and on `onDidChangeWorkspaceFolders`), if the workspace has
  no `.cursor/rules/ai-rules/` folder yet, the extension installs the bundled
  defaults automatically and then applies the **Build** mode profile
  (`role-developer` on, other roles + `test-rules/*` off). Existing rules
  folders are never overwritten by the auto-install path. The behavior is
  gated by `aiRules.autoInstallOnOpenWorkspace` (default `true`).
- The sidebar tree view colors active rule labels green and disabled rule
  labels muted gray (via a `FileDecorationProvider`) so on / off state is
  visible without reading the description column.
- The same color scheme is applied to rule files in VS Code's built-in
  Explorer for any `<name>.mdc` / `<name>.mdc.disabled` under
  `.cursor/rules/ai-rules/` in the open workspace. Gated by
  `aiRules.colorRulesInExplorer` (default `true`).
- Source of truth for rule text is `.cursor/rules/ai-rules/`. The VSIX ships
  a byte-identical copy under `bundled/ai-rules/`. `npm run verify:bundled`
  must pass before packaging.
- The pack is organized into five subfolders: `coding-rules/`,
  `documentation-rules/`, `role-rules/`, `rules-for-rules/`, `test-rules/`.
- Always-on coding, documentation, and meta rules are enabled by default
  after install. Role rules and test rules are disabled by default.
- The `evolve-rules-when-codebase-patterns-change.mdc` rule is disabled
  immediately after a fresh install or reset, unless it was already enabled
  before the operation.
- A sidebar tree view (`AI Rules: Rules`) lists every shipped rule grouped by
  subfolder, with one TreeItem checkbox per rule that toggles
  `<name>.mdc` ↔ `<name>.mdc.disabled`.
- Folder rows in the sidebar expose inline **Enable** and **Disable** actions
  that toggle every rule in that subfolder.
- Four mode commands flip curated presets:
  - **Mode — Plan**: enable `role-architect`; disable other roles and all test rules.
  - **Mode — Build**: enable `role-developer`; disable other roles and all test rules.
  - **Mode — Test**: enable `role-tester` and every `test-rules/*`; disable other roles.
  - **Mode — Role…**: pick one role; the other roles get disabled.
- Modes never disable always-on coding, documentation, or meta rules.
- When Cline is installed (`saoudrizwan.claude-dev` or
  `saoudrizwan.cline-nightly`) and `aiRules.autoSyncClineWhenInstalled` is
  on, the extension mirrors bundled `.mdc` rules into `.clinerules/ai-rules/`
  as `ai-rules-*.md` after install / reset / copy-from-global, and on first
  detection.
- A "global mirror" command set lets the user populate, remove, and copy a
  per-extension global mirror under
  `<globalStorage>/ai-rules-mirror/ai-rules/` independent of any workspace.
- The first substantive AI reply per chat must include the
  **`### Active project rules`** bullet list — driven by
  `rules-for-rules/state-active-project-rules-in-prompt-response.mdc`.

## Non-functional

- **License**: MIT. A `LICENSE` file ships in the VSIX.
- **Publisher**: `wyvernsystems`. Marketplace package id
  `wyvernsystems.ai-rules`.
- **Engines**: VS Code `^1.85.0`, Node `>=18.18.0`.
- **No runtime dependencies.** Only `@types/*`, `@vscode/vsce`, and
  `typescript` as devDependencies.
- **No network access.** The extension must never make outbound HTTP calls.
- **No secret material.** The extension must never read or write credentials,
  tokens, environment variables, or anything outside its allowed paths.
- The extension only writes inside three well-known locations:
  - the open workspace, under `.cursor/rules/ai-rules/` and (with Cline)
    `.clinerules/ai-rules/`;
  - the extension's global storage under
    `<globalStorage>/ai-rules-mirror/ai-rules/`;
  - nowhere else.
- **Manifest validation at activation.** Each entry must be a forward-slash
  relative path matching `^[A-Za-z0-9_./-]+$`, with no `..` segments, no
  leading `/` or `./`, and ≤ 200 chars. A malformed manifest aborts
  activation with a clear error.
- **Path containment** is asserted on every operation that resolves a
  manifest entry under a base directory. Out-of-tree paths must throw before
  any filesystem call.
- **Destructive operations** require an explicit suffix assertion:
  - workspace rules folder must end with `.cursor/rules/ai-rules`;
  - global mirror must end with `ai-rules-mirror/ai-rules`.
- **Recursive copies refuse symlinks.** `fs.cp` calls and the on-disk walker
  must skip symbolic links.
- **VSIX contents** are limited to compiled JS (`out/**`), the bundled rule
  pack (`bundled/**`), `icon.png` (≤ 128×128 PNG), `LICENSE`, `README.md`,
  `CHANGELOG.md`, and `package.json`. Source, scripts, lockfiles, build info,
  the high-resolution icon master, and any other tooling files must be
  excluded via `.vscodeignore`.
- **Marketplace icon** must be ≤ 128×128 PNG. The high-resolution master
  (`icon-source.png`) is preserved locally for re-rendering but excluded
  from the package.
- README is the marketplace description; it must be plain English, list
  every rule, every command, every mode, and the rule limitations.
- CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/) with an
  `[Unreleased]` section at the top.
- Rules in the pack must be short, scannable bullets so multiple active rules
  can fit inside the model's context window.

## Out of scope

- The extension does **not** ship per-language linters, formatters, or build
  tooling — only Markdown rule files and the UI to manage them.
- The extension does **not** call any AI provider, log telemetry, or sync
  anything to the cloud.
- The extension does **not** edit user settings (`settings.json`) outside
  its own `aiRules.*` namespace.
- The extension does **not** guarantee the AI follows every active rule —
  models may drop rules under context pressure (see README → *Limitations*).
