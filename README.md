# AI Rulebook — Cursor / VS Code extension

**One-line:** This extension drops a curated set of AI agent **rules** into your
project so Cursor (and Cline) reply more consistently — write cleaner code,
keep docs current, frame answers for the right audience, and write proper
tests when you ask for them.

- **Display name:** AI Rulebook
- **Package id:** `WyvernSystemsLLC.ai-rulebook`
- **License:** MIT
- **Source of truth for rules:** [`.cursor/rules/ai-rules/`](./.cursor/rules/ai-rules/)
  (the VSIX ships a byte-identical copy under [`bundled/ai-rules/`](./bundled/ai-rules/))

## What are AI rules and why use them?

A "rule" is a short Markdown file you give the AI assistant. It tells the
assistant **how you want it to behave** in this project — coding style,
security defaults, doc-keeping habits, who the answer is for, what to test,
etc.

Cursor and Cline both load rules automatically when you chat with them, so the
assistant follows your team's conventions without you having to remind it
every message.

This extension ships **27 ready-made rules** grouped into 5 folders, plus a
sidebar to turn them on and off, plus four **modes** (Plan / Build / Test /
Role) that flip presets in one click. You don't have to write any rules
yourself to get value — install, click "Install / update rules in workspace",
and start chatting.

```text
.cursor/rules/ai-rules/
├── ABOUT_RULES.md
├── coding-rules/            ← how to write and ship code
├── documentation-rules/     ← how to maintain docs and changelogs
├── role-rules/              ← how to frame replies for a given audience
├── rules-for-rules/         ← how the rule pack itself is authored and announced
└── test-rules/              ← how to design and write tests
```

## Quickstart

1. Install **AI Rulebook** in Cursor or VS Code.
2. Open the project you want the rules to apply to. The first time the
   extension sees a project, it drops the bundled rule pack into
   `.cursor/rules/ai-rules/` and starts it in **Build mode** (developer role on,
   tests off). Existing `.cursor/rules/ai-rules/` folders are never overwritten.
3. Click the checklist icon in the **activity bar** (left side) to open the
   **AI Rulebook** sidebar.
4. Toggle individual rules with the checkboxes in the sidebar, or pick a
   preset with the **Mode — Plan / Build / Test / Role…** buttons at the top
   of the sidebar.
5. Start chatting. The AI now follows the rules you have turned on.

To opt out of the first-time auto-install, set
`aiRules.autoInstallOnOpenWorkspace` to `false` and run
**`AI Rulebook: Install / update rules in workspace`** when you want it.

## Sidebar tree view — turn rules on and off

The **AI Rulebook** sidebar (activity-bar icon, looks like a checklist) is the
primary place to enable / disable rules. It shows every shipped rule grouped
by subfolder and uses color so the on / off state is obvious at a glance:

- **Green label + filled circle icon** — rule is active (`<name>.mdc` on
  disk, loaded by Cursor).
- **Dimmed gray label + empty circle icon** — rule is off
  (`<name>.mdc.disabled` on disk, ignored by Cursor).

What you can do from the sidebar:

| Where | Action |
|-------|--------|
| Title bar buttons (top of the view) | One-click **Mode — Plan / Build / Test / Role…** presets, plus a **Refresh** icon. The overflow menu (`…`) holds bulk actions: Enable all, Disable all, Install / update, Reset, Show active rules. |
| **Folder row** (e.g. `coding-rules/`) | Right-click → **Enable every rule in this folder** or **Disable every rule in this folder**. Inline check-all / close-all icons appear on hover. |
| **Rule row checkbox** | Click the checkbox to flip the rule on / off (renames `<name>.mdc` ↔ `<name>.mdc.disabled`). |
| **Rule row label** | Click the rule name to open the `.mdc` file in the editor. |
| **`Show active rules` command** | Opens / focuses the sidebar so you can scan the colored on / off state, and writes a plain-text snapshot to **Output → AI Rulebook** for logging. |

Switching modes from the sidebar buttons only flips role and test rules —
your always-on coding, documentation, and meta rules stay enabled. Manual
changes you make via the checkboxes always win until the next mode switch.

### Same colors in the workbench Explorer

The same color scheme also applies to rule files in VS Code's built-in
**Explorer** view: any `<name>.mdc` under `.cursor/rules/ai-rules/` shows up
green, and any `<name>.mdc.disabled` shows up muted gray. So you can browse
your rules folder like a normal folder and still see at a glance which rules
are active. Set `aiRules.colorRulesInExplorer` to `false` (or run **`AI
Rules: Hide active rules`**) to opt out; **`AI Rulebook: Show active rules`**
turns it back on. The sidebar tree always shows on / off colors regardless
of this setting.

## All commands

Every command lives under the **AI Rulebook:** prefix in the command palette.

### Install / update

| Command | Plain English |
|---------|---------------|
| Install / update rules in workspace | Copies all bundled rules into `.cursor/rules/ai-rules/`. The `evolve-rules` rule starts off unless it was already on. Auto-mirrors to Cline if Cline is installed. |
| Reset workspace rules folder to defaults… | Deletes the workspace rules folder and replaces it with the bundled defaults. Removes any extra rules you (or the AI) added. |
| Sync bundled rules to Cline (`.clinerules/ai-rules`) | Manually mirrors the bundled `.mdc` rules into `.clinerules/ai-rules/` (the format Cline reads). |

### Turn rules on or off

| Command | Plain English |
|---------|---------------|
| Enable all rules (workspace) | Turns every bundled rule **on** in this project. |
| Disable all rules (workspace) | Turns every bundled rule **off** in this project (renames to `.mdc.disabled`). |
| Enable or disable a single rule… | Pops up a picker for one rule and flips it on or off. |
| Enable every rule in this folder | (Sidebar) Turns every rule under the picked subfolder on. |
| Disable every rule in this folder | (Sidebar) Turns every rule under the picked subfolder off. |

### Modes

| Command | Plain English |
|---------|---------------|
| Mode — Plan | Architect role on; tests off. |
| Mode — Build | Developer role on; tests off. |
| Mode — Test | Tester role on; all `test-rules/*` on. |
| Mode — Role… | Pick a single role; the others get turned off. |

### Global mirror (cross-project)

The "global mirror" is a per-extension copy under VS Code / Cursor's global
storage. You can populate it once and then push it into any project.

| Command | Plain English |
|---------|---------------|
| Enable all rules (global mirror) | Refreshes the extension's global mirror from the bundle. |
| Disable all rules (global mirror) | Removes the global mirror. |
| Copy global mirror into workspace | Pushes the global mirror into the current project's rules folder. |

### Inspect / refresh

| Command | Plain English |
|---------|---------------|
| Show active rules (green = active) | Turns the Explorer green tint on (if you'd hidden it), focuses the AI Rulebook sidebar, and writes a plain-text snapshot to **Output → AI Rulebook**. |
| Hide active rules (no green) | Turns the Explorer green tint off (sets `aiRules.colorRulesInExplorer` to `false` at the user level). The sidebar tree's colors are unaffected. |
| Refresh sidebar | Re-reads the rules folder from disk and redraws the sidebar tree. |
| Open rule file | Opens a specific `.mdc` in the editor (used by the sidebar tree). |

## Modes

A "mode" is a one-click preset that turns specific rules on and others off.
**Always-on coding, documentation, and meta rules are not touched by modes** —
they keep running across every mode.

| Mode | Effect |
|------|--------|
| **Plan** | Turns on `role-architect`. Turns off all other roles and all test rules. Use when you want the assistant to design / discuss before coding. |
| **Build** | Turns on `role-developer`. Turns off all other roles and all test rules. Use when you want the assistant to write production code. |
| **Test** | Turns on `role-tester` and **every** rule under `test-rules/`. Turns off the other roles. Use when you want the assistant to write tests. |
| **Role…** | Pops up a picker so you can turn on a single role (and turn off the others). Doesn't touch test rules. |

You can also flip individual rules manually any time, in the sidebar or via
the command palette.

## Settings

| Setting | Default | Effect |
|---------|---------|--------|
| `aiRules.autoInstallOnOpenWorkspace` | `true` | When you open a workspace that has no `.cursor/rules/ai-rules/` folder yet, install the bundled rule pack automatically. Never overwrites an existing folder. |
| `aiRules.colorRulesInExplorer` | `true` | Tint rule files in VS Code's Explorer: `.mdc` (active) appears green and `.mdc.disabled` (off) appears muted gray, anywhere under `.cursor/rules/ai-rules/`. |
| `aiRules.promptInstallOnUpdate` | `true` | When the extension version changes, ask whether to refresh workspace rules from the bundled copy. |
| `aiRules.autoSyncClineWhenInstalled` | `true` | If Cline is installed, also mirror bundled `.mdc` rules into `.clinerules/ai-rules/` whenever rules change. |

## Every rule that ships with this extension

For longer descriptions read [`bundled/ai-rules/ABOUT_RULES.md`](./bundled/ai-rules/ABOUT_RULES.md).

### `coding-rules/` — always on

| Rule | What it does |
|------|--------------|
| `write-clean-code.mdc` | Naming, function size, comments, explicit dependencies, clear errors. |
| `reuse-code-before-duplicating.mdc` | Search for existing helpers before adding new ones; extract on the third copy. |
| `organize-repository-by-feature.mdc` | Feature-first folders, tidy root, stable entry points, colocated tests. |
| `secure-code-data-and-dependencies.mdc` | Secrets, input handling, authorization, crypto, dependencies, logging. |
| `prefer-lts-stable-runtimes-and-libraries.mdc` | LTS or current stable releases, sensible pinning, security patches. |
| `verify-syntax-and-fix-before-finishing.mdc` | Re-checks touched files for syntax / type issues and fixes what's safe. |
| `remove-dead-code-and-unused-files.mdc` | Looks for unused code and orphan files; removes only when clearly safe. |

### `documentation-rules/`

| Rule | When it runs | What it does |
|------|--------------|--------------|
| `update-changelog-for-notable-changes.mdc` | Always. | Keeps `CHANGELOG.md` current for user-visible changes. |
| `append-and-deduplicate-requirements.mdc` | Always. | Captures stated requirements in `REQUIREMENTS.md`; merges near-duplicates. |
| `use-this-format-for-markdown-files.mdc` | Only when editing `*.md` / `*.mdx` (or @-mentioned). | Standard Markdown structure, lists, code samples, links. |

### `role-rules/` — off by default; turned on by mode commands

These change **who the assistant is talking to**.

| Rule | Audience framing |
|------|------------------|
| `role-developer.mdc` | Working software developer — skip basics, lead with code and trade-offs. |
| `role-architect.mdc` | Lead with constraints, boundaries, and 2–3 viable approaches. |
| `role-tester.mdc` | Lead with what to verify, expected vs. actual, and risk. |
| `role-cyber-expert.mdc` | Treat everything as threat surface; STRIDE / OWASP framing. |
| `role-product-manager.mdc` | Lead with user value, scope, sequencing, rollout risk. |
| `role-beginner.mdc` | Define jargon; full commands; one safe path; explain *why*. |
| `role-expert.mdc` | Skip foundations; surface non-obvious edge cases; primary sources. |
| `role-end-user.mdc` | No code or jargon; describe what the user sees, clicks, and gets. |

### `rules-for-rules/`

| Rule | When it runs | What it does |
|------|--------------|--------------|
| `state-active-project-rules-in-prompt-response.mdc` | Always. | Makes the AI start its first reply with a list of every active rule, so you can verify what's loaded. |
| `evolve-rules-when-codebase-patterns-change.mdc` | Always (when not disabled). | Suggests new / updated rules when patterns stabilize across the codebase. |
| `write-cursor-rules-for-this-project.mdc` | Only when editing files under `.cursor/rules/ai-rules/` (or @-mentioned). | Spec for authoring & maintaining rule files: location, frontmatter, scope, quality bar. |

### `test-rules/` — off by default; turned on by **Mode — Test**

| Rule | Test type |
|------|-----------|
| `write-unit-tests.mdc` | Pure-logic units; arrange / act / assert; deterministic, fast. |
| `write-smoke-tests.mdc` | Critical happy paths only; fail-fast; block builds. |
| `write-regression-tests.mdc` | One test per fixed bug; reference issue / PR. |
| `write-integration-tests.mdc` | Real boundaries (DB, HTTP, queue); ephemeral environments. |
| `write-end-to-end-tests.mdc` | Top user journeys; stable selectors; flakes are bugs. |

## Limitations — read this before you blame the rules

Rules are **instructions to the model**, not enforcement. The assistant
chooses how to weigh them on every reply. In practice this means:

- **Context is limited.** Every active rule eats space in the model's context
  window. If you turn on 27 rules **and** include large files **and** a long
  chat history, the model may quietly drop or compress some rules. Symptom:
  rules you turned on don't appear to fire.
- **Some rules are stronger than others.** Always-on rules are loaded every
  turn; glob-scoped rules only when matching files are open; `@-mentioned`
  rules only on the turn you mention them. If a rule isn't firing, check the
  scope.
- **Models drift between turns.** A rule may apply on the first reply and not
  on the third. Re-mention it (`@write-clean-code`) or restate the relevant
  expectation.
- **Different products read rules differently.** Cursor and Cline don't have
  identical engines; Cline mirrors are best-effort.
- **The "Active project rules" header is not guaranteed.** Cursor depends on
  the model to honor `state-active-project-rules-in-prompt-response.mdc`. If
  the model skips it, mention `@state-active-project-rules-in-prompt-response`
  once in the chat.

**Practical advice:**

- Don't enable everything by default. Use **Mode — Plan / Build / Test** to
  match the work you're actually doing.
- For a big or complex task, turn off the rules you don't need that turn.
- If you want a rule to fire **definitely**, `@-mention` it in your message.
- If a rule keeps getting ignored, shorten it. Compressed rules survive
  truncation better.

## Security model

This extension only writes inside three well-known locations:

- the open workspace folder, under `.cursor/rules/ai-rules/` and (if Cline is
  installed) `.clinerules/ai-rules/`;
- the extension's **global storage** under
  `<globalStorage>/ai-rules-mirror/ai-rules/` — used by the global mirror
  commands;
- nothing outside those paths.

Defenses applied:

- **Manifest validation at activation.** Each entry in `bundled/manifest.json`
  must be a forward-slash relative path matching `^[A-Za-z0-9_./-]+$`, with
  no `..` segments, no leading `/` or `./`, and ≤ 200 chars. A tampered or
  malformed manifest aborts activation with a clear error.
- **Path containment.** Every operation that resolves a manifest entry under
  a base directory re-checks that the resolved path stays inside that base.
  Out-of-tree paths throw before any filesystem call.
- **Destructive operations are gated by an explicit suffix check.** The
  workspace rules folder must end with `.cursor/rules/ai-rules`; the global
  mirror with `ai-rules-mirror/ai-rules`. A misconfigured constant cannot
  widen the blast radius of `rm -rf`.
- **No symlinks during recursive copies.** The `fs.cp` calls used to mirror
  the bundle filter out symbolic links; the directory walker skips them too.
- **No network access.** The extension never makes outbound HTTP calls.
- **No runtime dependencies.** `package.json` has zero `dependencies`. The
  VSIX ships only compiled JS, the bundled rule files, an icon, the readme,
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

This produces `ai-rulebook-<version>.vsix` in the repo root. To upload it
to the [VS Code Marketplace](https://marketplace.visualstudio.com/manage):

1. Sign in as the publisher (`WyvernSystemsLLC`).
2. Choose **New extension → Visual Studio Code**.
3. Upload the `.vsix`.

For the [Open VSX](https://open-vsx.org/) registry (used by Cursor's gallery),
follow [their publishing guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).

## Notes

- Cursor **user rules** (app-wide) still live in **Cursor Settings → Rules**;
  this extension's "global mirror" is separate per-extension storage unless
  you copy it into a workspace.
- Cline may interpret YAML (`globs` vs `paths`) differently from Cursor; treat
  Cline output as best-effort.
