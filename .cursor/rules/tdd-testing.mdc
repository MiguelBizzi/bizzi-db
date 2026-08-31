---
description: TDD and testing standards for features, bug fixes, and regressions
alwaysApply: true
---

# TDD and testing

- New feature: write the failing test first, then implement until it passes.
- Bug fix: write a test that reproduces the bug, then fix the code.
- Place tests next to the unit: `foo.ts` → `foo.test.ts`; Rust `#[cfg(test)]` in the same module or `crates/*/tests/` for integration.
- Extract logic out of React components and test the function. Do not mount the whole tree unless the bug is interaction-only.
- Run `bun run test` before considering work done. Run `bun run test:all` when touching Postgres session, preview, introspect, or docker seed.
- No E2E in this phase (no Cypress, Playwright, or Tauri window drivers).
- Skip tests for types-only modules, one-line Tauri `invoke` wrappers, icons, and generated code.
- Tests must be deterministic and offline-friendly unless marked `#[ignore]` (Postgres live tests).
