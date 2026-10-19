---
description: Secure coding for credentials, IPC, SQL, and the Tauri webview
alwaysApply: true
---

# Secure coding

- Passwords live in the OS keychain only. Never add a password column, log, or `Debug` dump. `ConnectConfig` must redact secrets.
- Validate connection fields on the **Rust** side (`validate_save_input`, pool 1–32). Do not trust the form alone.
- Constructed SQL must quote identifiers (`"` → `""`) and escape literals (`'` → `''`). Prefer bind parameters for new dialects.
- Do not allowlist or rewrite editor SQL. `query_execute` is intentionally unrestricted.
- No `dangerouslySetInnerHTML`, `eval`, or `innerHTML`. Keep CSP tight (`img-src` is `'self' data: blob:` only).
- Do not add Tauri shell, fs, or http plugins without an explicit security review.
- Unix storage: app-data dir `0700`, `workspace.sqlite` `0600`. Do not log SQL that may contain secrets in new application logs.
