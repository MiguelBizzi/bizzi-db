<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/svg/lockup-horizontal-on-dark.svg">
    <img alt="Bizzi DB" src="assets/brand/svg/lockup-horizontal-on-light.svg" height="72">
  </picture>
</p>

<h1 align="center">Bizzi DB</h1>

<p align="center"><strong>PostgreSQL, native and fast.</strong><br>A private desktop workspace for browsing data, designing schemas, and running SQL.</p>

<p align="center">
  <a href="https://github.com/MiguelBizzi/bizzi-db/releases/latest"><strong>Download</strong></a> ·
  <a href="#start-querying">Getting started</a> ·
  <a href="#features">Features</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="#contributing">Contribute</a> ·
  <a href="https://buymeacoffee.com/miguelbizzi">Buy me a coffee</a>
</p>

<p align="center">
  <a href="Cargo.toml"><img src="https://img.shields.io/badge/Built_with-Tauri_%C2%B7_React_%C2%B7_Rust-d87943" alt="Built with Tauri, React, and Rust"></a>
  <a href="https://github.com/MiguelBizzi/bizzi-db/releases/latest"><img src="https://img.shields.io/badge/Platform-macOS-15171c" alt="Available for macOS"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-d87943" alt="MIT license"></a>
</p>

Bizzi DB is a PostgreSQL client written with [Tauri](https://tauri.app), React, and Rust. It runs on your machine, keeps your connections and passwords local, and starts quickly without a browser engine behind it. There is no account to create and no cloud service in between.

<!-- Add a screenshot at assets/brand/png/app-screenshot.png and uncomment:
![Bizzi DB showing a table grid, schema diagram, and SQL editor](assets/brand/png/app-screenshot.png)
-->

## Features

| Feature | What you can do |
|---|---|
| **Data grid** | Open any table in a spreadsheet-style grid. Filter with expressions, choose visible columns, follow foreign keys, and insert rows from a side drawer. Export to CSV. |
| **Reviewed changes** | Edits are staged in a pending changes drawer. Review each one, discard what you don't want, then apply the rest. |
| **Schema diagram** | Explore tables and relationships in an interactive entity-relationship diagram. |
| **Schema designer** | Add, edit, and delete columns from a visual table designer. |
| **SQL editor** | Work in multiple tabs with query history and saved statements. Inspect query plans with EXPLAIN output. |
| **Metrics and activity** | See database metrics and a log of what you have run. |
| **Command palette** | Run actions from the keyboard. |
| **Keychain storage** | Passwords live in your operating system's keychain, never in plain text on disk. |
| **SSL by default** | SSL is on for remote hosts. Bizzi DB warns you before you turn it off for a remote server. |
| **Auto updates** | Checks on launch and every six hours. Updates download in the background, are verified, and install only after you confirm. |

## Install

| Platform | Installation |
|---|---|
| **macOS** | [Download the universal DMG](https://github.com/MiguelBizzi/bizzi-db/releases/latest) for Apple silicon or Intel. Drag Bizzi DB into Applications and open it. |
| **Windows and Linux** | Not available yet. |
| **From source** | See [Development](#development). |

The first install is always manual. After that, Bizzi DB updates itself from the same GitHub Release.

## Start querying

1. Open Bizzi DB and add a connection with the host, port, database, and user for your PostgreSQL server. Turn on SSL for remote servers.
2. Pick a table in the sidebar to browse its data, or open the SQL editor to write a query.
3. Review pending changes before you apply them.

To try Bizzi DB without a server of your own, run the local test database described in [Development](#development).

## Security

Bizzi DB is local-only. There is no application backend. Read [SECURITY.md](SECURITY.md) for the data flow, accepted risks, and the update trust model.

To report a vulnerability or a credential or data-exposure bug, please contact the maintainers privately instead of opening a public issue.

## Contributing

Found a bug or have an idea? [Open an issue](https://github.com/MiguelBizzi/bizzi-db/issues). Pull requests are welcome against `main`.

### Development

You need [Bun](https://bun.sh) 1.3 or later, [Rust](https://rustup.rs) 1.88 or later, and [Docker](https://www.docker.com) for the local test database.

```sh
bun install
bun run db:up   # local PostgreSQL on 127.0.0.1:5433 (user postgres, password postgres)
bun run dev     # launch the desktop app
```

Run the tests with `bun run test`. To cut a release, follow [RELEASING.md](RELEASING.md).

## Support the project

Bizzi DB is free and open source. If it saves you time, you can support its development on [Buy Me a Coffee](https://buymeacoffee.com/miguelbizzi).

[![Buy Me a Coffee](https://img.shields.io/badge/Buy_me_a_coffee-miguelbizzi-d87943?logo=buymeacoffee&logoColor=white)](https://buymeacoffee.com/miguelbizzi)

## Acknowledgements

Bizzi DB is built on [Tauri](https://tauri.app), [React](https://react.dev), and [Rust](https://www.rust-lang.org). The wordmark uses [Geist Mono](https://vercel.com/font) (SIL OFL).

## License

Released under the [MIT License](LICENSE).
