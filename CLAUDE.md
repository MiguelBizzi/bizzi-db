# Bizzi DB

Project rules live in `.claude/rules/` and Claude Code loads them automatically. `.cursor/rules/*.mdc` are symlinks to the same files, so Cursor follows the same rules.

When cutting a release, follow `.cursor/rules/cut-release.mdc`.
