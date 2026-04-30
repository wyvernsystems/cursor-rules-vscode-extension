# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **Validated bundled manifest at load.** `src/manifest.ts` now schema-checks
  `bundled/manifest.json`: rejects missing fields, non-array `files`, and any
  entry that fails the safe-path predicate (`^[A-Za-z0-9_./-]+$`, no `..`,
  no leading `/` or `./`, ≤ 200 chars). A tampered manifest aborts activation
  with a clear error instead of being trusted.
- **Path containment checks** on every operation that resolves a manifest entry
  under a base directory (bundle, workspace rules dir, global mirror, Cline
  mirror). New `src/safePaths.ts` module exposes `isSafeManifestEntry`,
  `assertContainedPath`, and `assertSafeDeletionTarget`.
- **Destructive operations gated by suffix assertions.** `resetRulesDirToBundle`
  refuses to delete a path that doesn't end with `.cursor/rules/ai-rules`;
  `replaceGlobalMirror` / `removeGlobalMirror` refuse paths not ending with
  `ai-rules-mirror/ai-rules`. Defends against constant corruption widening the
  blast radius of `rm -rf`.
- **Recursive copies refuse symlinks.** The `fs.cp(...)` calls that mirror the
  bundle into the workspace and global storage now use a `filter` callback
  that skips symbolic links. The directory walker in `deleteUnshippedFiles`
  also skips symlinks.
- **Hardened `aiRules.revealRuleFile` arguments**: rejects non-string args,
  unsafe shapes, and any `rulePath` not present in the validated manifest
  before resolving / opening.
- **Friendlier failure surface**: if `bundled/manifest.json` is missing or
  invalid, the user sees the underlying reason in the error toast instead of
  a generic "missing copy" string.

### Changed

- **Rule pack: simplified and deduped.** Every rule under `.cursor/rules/ai-rules/`
  rewritten as a tighter, scannable bullet list so models with limited context can
  honor every active rule. Cross-rule overlap removed.
- **`src/extension.ts`** routes all destructive / copy operations through new
  helpers in `src/rulesOperations.ts` (`copyManifestFiles`, `replaceGlobalMirror`,
  `removeGlobalMirror`) instead of inline `fs.rm` / `fs.cp` calls.
- **Marketplace metadata** filled in: `license: MIT`, `icon: icon.png`,
  `homepage`, `bugs`, `keywords`, `engines.node ≥ 18.18.0`, repo URL switched
  to `git+https://...` form for `vsce` compatibility.
- **`.vscodeignore`** tightened: source, scripts, lockfiles, build info, hi-res
  icon source, and `*.vsix` excluded from the packaged extension. Only
  compiled JS, bundled rules, the 128×128 icon, README, CHANGELOG, and LICENSE
  are shipped.
- **`.gitignore`** ignores `*.tsbuildinfo` and `icon-source.png` (the hi-res
  master kept locally for re-rendering the 128×128 marketplace icon).
- **Renamed**
  `rules-for-rules/state-active-project-rules.mdc` →
  `rules-for-rules/state-active-project-rules-in-prompt-response.mdc`. Body reduced
  to a "print a bullet list of active rule paths" instruction—no embedded
  per-rule descriptions—so the rendered `### Active project rules` block stays
  short and accurate when rules are enabled / disabled.
- Updated `bundled/manifest.json`, `ABOUT_RULES.md`, and `README.md` references
  to the new filename.
- Dropped the duplicate "Duplication: extract on third repetition" bullet from
  `coding-rules/write-clean-code.mdc` (covered by
  `coding-rules/reuse-code-before-duplicating.mdc`).

### Removed

- `rules-for-rules/maintain-cursor-rules.mdc` — content folded into
  `rules-for-rules/write-cursor-rules-for-this-project.mdc`, which is now the
  single source for both authoring and ongoing maintenance / deprecation
  guidance for rule files. Both rules previously shared the same `globs` scope
  (`**/.cursor/rules/ai-rules/**/*.mdc`) and overlapping content.

### Added

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
- New commands wiring the sidebar:
  - `aiRules.refreshTree`, `aiRules.revealRuleFile`,
  - `aiRules.enableFolder`, `aiRules.disableFolder`.
- New module `src/sidebarTreeView.ts` (`RulesTreeProvider`,
  `bindRulesTreeView`, `RULES_TREE_VIEW_ID`).
- **Role rules** (`.cursor/rules/ai-rules/role-rules/`)—8 audience-framing rules,
  off by default, toggled by the new mode commands:
  - `role-developer.mdc`, `role-architect.mdc`, `role-tester.mdc`,
    `role-cyber-expert.mdc`, `role-product-manager.mdc`, `role-beginner.mdc`,
    `role-expert.mdc`, `role-end-user.mdc`.
- **Test rules** (`.cursor/rules/ai-rules/test-rules/`)—5 testing playbooks,
  off by default, enabled together by `Mode — Test`:
  - `write-unit-tests.mdc`, `write-smoke-tests.mdc`,
    `write-regression-tests.mdc`, `write-integration-tests.mdc`,
    `write-end-to-end-tests.mdc`.
- **Mode commands** (the AI Rules VS Code extension):
  - `AI Rules: Mode — Plan` (architect role, no test rules)
  - `AI Rules: Mode — Build` (developer role, no test rules)
  - `AI Rules: Mode — Test` (tester role + every test rule)
  - `AI Rules: Mode — Role…` (QuickPick: enable one role, disable the others)
- New module `src/modes.ts` defining the mode preset shape and helpers
  (`applyModeProfile`, `applyRolePick`, `MODE_PROFILES`, `ROLE_RULES`,
  `TEST_RULES`).
- `state-active-project-rules.mdc` now lists role and test rules as add-on rows
  the assistant should print when those rules are actually injected.

### Changed

- Rewrote every rule under `.cursor/rules/ai-rules/` for clarity and lower token
  cost: imperative bullets, fewer adjectives, and one example per rule only when
  it prevents misreads. Total rule pack size reduced from ~26.2 KB to ~19.8 KB
  (~24% smaller) without dropping intent.
- `state-active-project-rules.mdc` now includes a verbatim copy-paste template
  for the **`### Active project rules`** section so models comply more reliably.
- Reorganized the rule pack into three subfolders inside
  `.cursor/rules/ai-rules/`:
  - `coding-rules/` — write/reuse/organize/secure/LTS/verify/dead-code rules.
  - `documentation-rules/` — changelog, requirements, markdown formatting.
  - `rules-for-rules/` — meta rules that govern how the pack itself is authored
    and announced.
- Updated `mdc:` cross-links and the `state-active-project-rules.mdc` template
  to use the new subfolder paths so the rendered "Active project rules" block
  reflects the layout on disk.

### Fixed

- `scripts/sync-bundled.mjs` now walks recursively when generating
  `bundled/manifest.json`, so manifest paths include subfolders (e.g.
  `coding-rules/write-clean-code.mdc`).
- `src/rulesOperations.ts`:
  - `installBundleToRulesDir` and `setRuleEnabled` create parent directories
    before copying or renaming, so subfolder rules install and toggle
    correctly.
  - `deleteUnshippedFiles` walks the rules directory recursively when checking
    which files are part of the bundle.
  - The Cline mirror writer flattens any subfolder path into the output
    filename (`ai-rules-coding-rules-write-clean-code.md`) to avoid collisions
    and keep `.clinerules/ai-rules/` flat.
  - `EVOLVE_RULE` now points at `rules-for-rules/evolve-rules-when-codebase-patterns-change.mdc`.
- `src/extension.ts` "Copy global mirror into workspace" creates parent
  directories before each `copyFile`.
- `ABOUT_RULES.md` and `README.md` updated to describe the new layout.
