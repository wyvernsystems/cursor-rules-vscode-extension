# About these rules

This document replaces the former **`rules.md`** and **`ABOUT_THE_RULES.md`**—one place for how the pack works and what each rule file does.

## How rules work

Cursor **project rules** are Markdown files with optional YAML **frontmatter**, stored under **`.cursor/rules/`**. In this repository they live in the subfolder **`ai-rules/`**. Each file is usually **`.mdc`**, which supports `description`, `globs`, and `alwaysApply` in the frontmatter. Cursor decides which rules to include in a chat based on that metadata: **`alwaysApply: true`** rules are candidates for every conversation; others apply when **file paths match `globs`** (e.g. only while editing `*.md`) or when you **@‑mention** a rule. The agent then follows the **body** of those rules as extra instructions—rules are versioned with the repo like normal docs.

## Rule reference

| Rule | When it runs | Summary |
|------|--------------|---------|
| `state-active-project-rules.mdc` | **Always** (`alwaysApply: true`). | At the start of a new chat or agent run, it tells you which project rules apply, using each rule’s filename and a short phrase. |
| `write-cursor-rules-for-this-project.mdc` | **Glob only** when paths match `**/.cursor/rules/ai-rules/**/*.mdc` (editing or focusing rule files in this pack). Also when **@‑mentioned**. | It documents where `.mdc` files go, what frontmatter to use, naming conventions, and a merge checklist for this rules folder. |
| `maintain-cursor-rules.mdc` | **Glob only** with the same pattern as `write-cursor-rules-for-this-project.mdc`. Also when **@‑mentioned**. | It guides how to edit, review quality, deprecate, and keep rule examples and links in sync when you touch rule files. |
| `evolve-rules-when-codebase-patterns-change.mdc` | **Always** (`alwaysApply: true`) when the `.mdc` is not renamed to `.mdc.disabled`. | It describes when changing code should prompt new or updated rules and how to spot patterns without one oversized rule file. |
| `write-clean-code.mdc` | **Always** (`alwaysApply: true`). | It sets expectations for readable code: naming, function size, meaningful comments, explicit dependencies, and clear errors. |
| `reuse-code-before-duplicating.mdc` | **Always** (`alwaysApply: true`). | It tells the agent to search for existing helpers and reuse or extract shared code instead of duplicating logic across files. |
| `organize-repository-by-feature.mdc` | **Always** (`alwaysApply: true`). | It keeps the repo organized with feature-first folders, a tidy root, stable entry points, and consistent colocated tests. |
| `secure-code-data-and-dependencies.mdc` | **Always** (`alwaysApply: true`). | It reinforces secure defaults for secrets, input handling, authorization, crypto, dependencies, and logging without leaking sensitive data. |
| `prefer-lts-stable-runtimes-and-libraries.mdc` | **Always** (`alwaysApply: true`). | It steers toolchains and libraries toward LTS or current stable releases, sensible pinning, and timely security patches. |
| `use-this-format-for-markdown-files.mdc` | **Glob only**: when open or relevant files match `**/*.{md,mdx}`. Also when **@‑mentioned**. | It standardizes Markdown structure, lists, code samples, links, and README sections when working in `.md` or `.mdx` files. |

For VS Code UI settings bundled with this workspace, see **`.vscode/settings.json`** at the repo root (that file is not a Cursor rule).
