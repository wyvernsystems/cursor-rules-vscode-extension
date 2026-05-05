# About these rules

Short Markdown rules with YAML frontmatter live under **`.cursor/rules/ai-rules/`**. Cursor loads them by `alwaysApply`, `globs`, or **@-mention**. Toggle on/off by renaming `<name>.mdc` ↔ `<name>.mdc.disabled` (the AI Rulebook extension does this).

## Layout

```text
.cursor/rules/ai-rules/
├── ABOUT_RULES.md
├── coding-rules/       # ship quality & structure
├── context-rules/      # dense handoff + low-token session habits
├── documentation-rules/# REQUIREMENTS, CHANGELOG, Markdown shape
├── role-rules/         # audience framing (modes pick one)
├── rules-for-rules/    # meta (often off in lightweight Build)
└── test-rules/        # test style (Mode — Test turns all on)
```

## Modes (AI Rulebook extension)

| Command | Effect |
|---------|--------|
| **Mode — Plan** | `role-architect` on; other roles + all test rules off; restores full coding + `rules-for-rules/*`. |
| **Mode — Build** | `role-developer` on; other roles + test rules off; **`rules-for-rules/*` off**; **off**: verify-syntax, secure-code, reuse, remove-dead-code, prefer-LTS (lighter dev default). Docs + core coding (`write-clean-code`, `organize-repository-by-feature`) stay on. |
| **Mode — Test** | `role-tester` + every `test-rules/*` on; other roles off; restores full coding + `rules-for-rules/*`. |
| **Mode — Low token** | Only: `write-clean-code`, `organize-repository-by-feature`, `dense-session-handoff-context`, `low-token-session-habits`—minimal context for long sessions. |
| **Mode — Role…** | Pick one role; others off. Does not change test rules. |

Switching Plan or Test **re-enables** the rules Build turns off. Install / auto-install ends in **Build** mode (lightweight profile).

## Rule reference

### `coding-rules/`

| Rule | Summary |
|------|---------|
| `write-clean-code.mdc` | Names, small functions, explicit errors. |
| `organize-repository-by-feature.mdc` | Feature-first layout, boundaries. |
| `reuse-code-before-duplicating.mdc` | Search, compose, extract on third copy. |
| `secure-code-data-and-dependencies.mdc` | Secrets, input, authz, crypto, deps, logs. |
| `prefer-lts-stable-runtimes-and-libraries.mdc` | LTS stacks, pinning, maintenance. |
| `verify-syntax-and-fix-before-finishing.mdc` | Re-read edits; run checks; fix regressions. |
| `remove-dead-code-and-unused-files.mdc` | Remove dead code with evidence. |

### `context-rules/`

| Rule | When | Summary |
|------|------|---------|
| `dense-session-handoff-context.mdc` | @-mention | One ultra-dense block to paste into a new chat (goal / done / stack / blockers / next). |
| `low-token-session-habits.mdc` | `alwaysApply` when enabled | Terse replies; avoid redundant recap (used with Low-token mode). |

### `documentation-rules/`

| Rule | Summary |
|------|---------|
| `append-and-deduplicate-requirements.mdc` | REQUIREMENTS.md upkeep. |
| `update-changelog-for-notable-changes.mdc` | CHANGELOG for visible changes. |
| `use-this-format-for-markdown-files.mdc` | Markdown discipline (`**/*.{md,mdx}`). |

### `role-rules/` (modes toggle)

Architect, developer, tester, cyber-expert, PM, beginner, expert, end-user—see each file.

### `rules-for-rules/`

| Rule | Summary |
|------|---------|
| `state-active-project-rules-in-prompt-response.mdc` | First reply lists active rules (verbatim block). |
| `evolve-rules-when-codebase-patterns-change.mdc` | Add/update rules when patterns stabilize. |
| `write-cursor-rules-for-this-project.mdc` | Authoring `.mdc` files (`**/.cursor/rules/ai-rules/**/*.mdc`). |

### `test-rules/` (Mode — Test enables all)

Unit, smoke, regression, integration, E2E—see each file.

VS Code workspace settings: **`.vscode/settings.json`** (not a Cursor rule).

## Extension vs repo

The VSIX ships **`bundled/ai-rules/`**. Source of truth: **`.cursor/rules/ai-rules/`**. After edits run `npm run sync-bundled` and `npm run verify:bundled` before packaging.
