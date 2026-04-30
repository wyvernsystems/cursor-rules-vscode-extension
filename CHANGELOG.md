# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.2] - 2026-04-29

### Changed

- **Publisher renamed** `wyvernsystems` → `WyvernSystemsLLC` in
  `package.json` to match the actual VS Code Marketplace publisher account.
  The Marketplace package id is now **`WyvernSystemsLLC.ai-rules`**. README
  and REQUIREMENTS updated to reflect the new id. No prior public
  Marketplace release used the old id (uploads were rejected with a
  publisher-mismatch error), so this is a no-op for end users.

## [1.0.1] - 2026-04-29

### Fixed

- **`AI Rules: Hide active rules` did nothing when a Workspace-level
  `aiRules.colorRulesInExplorer` setting existed.** The command always wrote
  to `ConfigurationTarget.Global` (User scope), which is shadowed by any
  Workspace or Folder override—so the effective value never flipped to
  `false` and the green tint stayed. Both `Hide active rules` and
  `Show active rules` now write to whichever scope is currently overriding
  the value (folder > workspace > user) via `WorkspaceConfiguration.inspect`.
- Both commands now also call `explorerColors.refresh()` directly after the
  setting update, so the Explorer's decoration cache re-queries even if the
  `onDidChangeConfiguration` listener is debounced.

## [1.0.0] - 2026-04-29

First **stable** release. Marketplace listing, packaging, and rule pack
considered ready for general use. No breaking changes versus 0.5.0—command
IDs, settings, and on-disk format are stable.

### Added

- **`AI Rules: Hide active rules (no green)`** command. Sets
  `aiRules.colorRulesInExplorer` to `false` at the User scope so the green
  / muted tint disappears from the workbench Explorer. The AI Rules
  sidebar tree's colors are deliberately unaffected—the sidebar exists to
  surface on / off state, so removing color there would defeat its
  purpose.
- The companion `AI Rules: Show active rules` command now also flips
  `aiRules.colorRulesInExplorer` back to `true` (idempotent—no-op if
  already on) so the pair behaves symmetrically.
- Both commands are surfaced in the sidebar title-bar overflow menu under
  the **Inspect** group.

## [0.5.0] - 2026-04-29

### Added

- **Explorer file-name coloring.** A new `WorkspaceRuleFileColorer`
  (`vscode.FileDecorationProvider`) tints `.mdc` files green and
  `.mdc.disabled` files muted gray in VS Code's built-in Explorer (and
  any other view that renders real `file://` URIs), for any rule under
  `.cursor/rules/ai-rules/` in the open workspace. Sibling to the existing
  sidebar tree decoration, which uses synthetic URIs.
- New setting `aiRules.colorRulesInExplorer` (default `true`) opts out of
  the Explorer coloring without affecting the AI Rules sidebar.
- Listening for `onDidChangeConfiguration` so flipping the setting
  re-publishes decorations without a reload.

### Changed

- **Renamed command** `AI Rules: Show pack status (green = active)` →
  `AI Rules: Show active rules (green = active)`. Command ID stays
  `aiRules.showPackStatus` so existing keybindings keep working. README,
  sidebar overflow menu, and changelog references updated.
- `RulesTreeProvider` now exposes a generic `onAfterRefresh(cb)` hook (used
  by both decoration providers) instead of the previous one-off
  `setDecorationProvider` setter.

## [0.4.0] - 2026-04-29

### Added

- **Auto-Build mode on first install.** The first-time auto-install now
  finishes by applying the **Build** mode profile: `role-developer` is
  enabled and the other roles + every `test-rules/*` start disabled. Users
  who want a different default can flip modes from the sidebar title bar.
- **Colored sidebar rule labels.** A new `FileDecorationProvider` paints
  active rule labels in green (`testing.iconPassed`) and disabled rule
  labels in muted gray (`disabledForeground`), so on / off state is obvious
  in the sidebar tree without reading the description column.
- **README** got a dedicated **Sidebar tree view — turn rules on and off**
  section explaining the title-bar buttons, folder row actions, rule
  checkboxes, and the `Show pack status` flow.

### Changed

- **`AI Rules: Show pack status`** now focuses the AI Rules sidebar (where
  the colored state lives) and writes a plain-text log to **Output → AI
  Rules** alongside it, instead of dumping ANSI escape codes that VS Code's
  Output panel does not render. The Output channel is no longer auto-popped
  on every install / mode change.

## [0.3.0] - 2026-04-29

### Added

- **Auto-install on first open.** When the extension activates in a workspace
  that does not yet have `.cursor/rules/ai-rules/`, it now drops the bundled
  rule pack into the workspace automatically (and mirrors to Cline if
  applicable). Existing rules folders are never overwritten — use the
  explicit **Install / update** or **Reset** commands for that. Re-runs on
  `onDidChangeWorkspaceFolders` so newly added folders pick up the pack.
- New setting `aiRules.autoInstallOnOpenWorkspace` (default `true`) to opt
  out of the auto-install.

### Changed

- **README reorder**: `## All commands`, `## Modes`, and `## Settings` now
  appear above `## Every rule that ships with this extension`, so a new user
  sees how to operate the extension before scrolling through the per-rule
  table. Quickstart updated to describe the new auto-install behavior.

## [0.2.0] - 2026-04-29

First Marketplace release.

### Renamed

- **Package name**: `wyvern-ai-rules` → `ai-rules`. The Marketplace
  package id is now `wyvernsystems.ai-rules` (publisher unchanged), and
  `vsce package` produces `ai-rules-<version>.vsix` (e.g.
  `ai-rules-0.2.0.vsix`) instead of `wyvern-ai-rules-<version>.vsix`. No
  prior public release used the old id.

### Added

- **Plain-English README** that doubles as the Marketplace description: an
  intro that explains what AI rules are and why to use them, the full per-rule
  table grouped by subfolder, every command (in plain English), every mode,
  every setting, and a *Limitations* section covering context-window pressure
  and rule-firing caveats.
- **`REQUIREMENTS.md`** capturing the working functional requirements,
  non-functional constraints (license, no network, no runtime deps, security
  invariants, VSIX contents), and explicit non-goals.
- **Sidebar tree view** (`AI Rules: Rules`) contributed under a new activity-bar
  view container `aiRulesSidebar`:
  - Subfolder → rule hierarchy with a real **TreeItem checkbox** per rule that
    flips `<name>.mdc` ↔ `<name>.mdc.disabled` via the existing rename helper.
  - Click a rule's label to open the `.mdc` file in the editor.
  - View title actions for **Plan / Build / Test / Role…** modes plus a
    refresh icon; overflow includes bulk install / enable-all / disable-all /
    reset / show-pack-status.
  - Folder rows expose inline **Enable / Disable** actions that toggle every
    rule under the selected subfolder.
- New commands wiring the sidebar: `aiRules.refreshTree`,
  `aiRules.revealRuleFile`, `aiRules.enableFolder`, `aiRules.disableFolder`.
- New module `src/sidebarTreeView.ts` (`RulesTreeProvider`,
  `bindRulesTreeView`, `RULES_TREE_VIEW_ID`).
- **Role rules** (`.cursor/rules/ai-rules/role-rules/`) — 8 audience-framing
  rules, off by default, toggled by the new mode commands:
  `role-developer.mdc`, `role-architect.mdc`, `role-tester.mdc`,
  `role-cyber-expert.mdc`, `role-product-manager.mdc`, `role-beginner.mdc`,
  `role-expert.mdc`, `role-end-user.mdc`.
- **Test rules** (`.cursor/rules/ai-rules/test-rules/`) — 5 testing playbooks,
  off by default, enabled together by `Mode — Test`:
  `write-unit-tests.mdc`, `write-smoke-tests.mdc`,
  `write-regression-tests.mdc`, `write-integration-tests.mdc`,
  `write-end-to-end-tests.mdc`.
- **Mode commands**:
  - `AI Rules: Mode — Plan` (architect role, no test rules)
  - `AI Rules: Mode — Build` (developer role, no test rules)
  - `AI Rules: Mode — Test` (tester role + every test rule)
  - `AI Rules: Mode — Role…` (QuickPick: enable one role, disable the others)
- New module `src/modes.ts` defining the mode preset shape and helpers
  (`applyModeProfile`, `applyRolePick`, `MODE_PROFILES`, `ROLE_RULES`,
  `TEST_RULES`).
- New module `src/safePaths.ts` — `isSafeManifestEntry`,
  `assertContainedPath`, `assertSafeDeletionTarget` — used at every boundary
  that resolves a manifest entry under a base directory.
- **`LICENSE`** (MIT) at the repo root, shipped in the VSIX.
- **`icon.png`** (128×128) at the repo root for the Marketplace listing.
  Hi-res master kept locally as `icon-source.png` (excluded from the VSIX
  and from git).

### Changed

- **Rule pack: simplified and deduped.** Every rule under
  `.cursor/rules/ai-rules/` rewritten as a tighter, scannable bullet list so
  models with limited context can honor every active rule. Cross-rule overlap
  removed.
- **Rename**: `rules-for-rules/state-active-project-rules.mdc` →
  `rules-for-rules/state-active-project-rules-in-prompt-response.mdc`. Body
  reduced to a "print a bullet list of active rule paths" instruction so the
  rendered `### Active project rules` block stays short and accurate when
  rules are toggled.
- **`src/extension.ts`** routes all destructive / copy operations through
  helpers in `src/rulesOperations.ts` (`copyManifestFiles`,
  `replaceGlobalMirror`, `removeGlobalMirror`) instead of inline `fs.rm` /
  `fs.cp` calls.
- **Marketplace metadata** filled in: `license: MIT`, `icon: icon.png`,
  `homepage`, `bugs`, `keywords`, `engines.node ≥ 18.18.0`, repo URL switched
  to `git+https://...` form for `vsce` compatibility. `package.json#files`
  removed (vsce 3.x requires `.vscodeignore` instead).
- **`.vscodeignore`** tightened: source, scripts, lockfiles, build info,
  hi-res icon source, and `*.vsix` excluded from the packaged extension.
  Only compiled JS, bundled rules, the 128×128 icon, README, CHANGELOG, and
  LICENSE are shipped.
- **`.gitignore`** ignores `*.tsbuildinfo` and `icon-source.png`.
- Reorganized the rule pack into five subfolders inside
  `.cursor/rules/ai-rules/`: `coding-rules/`, `documentation-rules/`,
  `role-rules/`, `rules-for-rules/`, `test-rules/`.
- `mdc:` cross-links and `state-active-project-rules.mdc` template updated
  to use the subfolder paths.
- Dropped the duplicate "Duplication: extract on third repetition" bullet
  from `coding-rules/write-clean-code.mdc` (covered by
  `coding-rules/reuse-code-before-duplicating.mdc`).

### Removed

- `rules-for-rules/maintain-cursor-rules.mdc` — content folded into
  `rules-for-rules/write-cursor-rules-for-this-project.mdc`, which is now the
  single source for both authoring and ongoing maintenance / deprecation
  guidance for rule files. Both rules previously shared the same `globs`
  scope and overlapping content.

### Security

- **Validated bundled manifest at load.** `src/manifest.ts` now schema-checks
  `bundled/manifest.json`: rejects missing fields, non-array `files`, and
  any entry that fails the safe-path predicate (`^[A-Za-z0-9_./-]+$`, no
  `..`, no leading `/` or `./`, ≤ 200 chars). A tampered manifest aborts
  activation with a clear error instead of being trusted.
- **Path containment checks** on every operation that resolves a manifest
  entry under a base directory (bundle, workspace rules dir, global mirror,
  Cline mirror).
- **Destructive operations gated by suffix assertions.**
  `resetRulesDirToBundle` refuses to delete a path that doesn't end with
  `.cursor/rules/ai-rules`; `replaceGlobalMirror` / `removeGlobalMirror`
  refuse paths not ending with `ai-rules-mirror/ai-rules`.
- **Recursive copies refuse symlinks.** The `fs.cp(...)` calls that mirror
  the bundle into the workspace and global storage now use a `filter`
  callback that skips symbolic links. The directory walker in
  `deleteUnshippedFiles` also skips symlinks.
- **Hardened `aiRules.revealRuleFile` arguments**: rejects non-string args,
  unsafe shapes, and any `rulePath` not present in the validated manifest
  before resolving / opening.
- **Friendlier failure surface**: if `bundled/manifest.json` is missing or
  invalid, the user sees the underlying reason in the error toast instead
  of a generic "missing copy" string.

### Fixed

- `scripts/sync-bundled.mjs` walks recursively when generating
  `bundled/manifest.json`, so manifest paths include subfolders (e.g.
  `coding-rules/write-clean-code.mdc`).
- `src/rulesOperations.ts`:
  - `installBundleToRulesDir` and `setRuleEnabled` create parent
    directories before copying or renaming, so subfolder rules install and
    toggle correctly.
  - `deleteUnshippedFiles` walks the rules directory recursively when
    checking which files are part of the bundle.
  - The Cline mirror writer flattens any subfolder path into the output
    filename (`ai-rules-coding-rules-write-clean-code.md`) to avoid
    collisions and keep `.clinerules/ai-rules/` flat.
  - `EVOLVE_RULE` points at
    `rules-for-rules/evolve-rules-when-codebase-patterns-change.mdc`.
- `ABOUT_RULES.md` and `README.md` describe the current layout.
