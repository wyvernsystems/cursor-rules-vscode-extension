# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Rewrote every rule under `.cursor/rules/ai-rules/` for clarity and lower token
  cost: imperative bullets, fewer adjectives, and one example per rule only when
  it prevents misreads. Total rule pack size reduced from ~26.2 KB to ~19.8 KB
  (~24% smaller) without dropping intent.
- `state-active-project-rules.mdc` now includes a verbatim copy-paste template
  for the **`### Active project rules`** section so models comply more reliably.
- Mirrored updated rules into `bundled/ai-rules/` via `npm run sync-bundled` and
  confirmed with `npm run verify:bundled`.
