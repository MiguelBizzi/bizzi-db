<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/svg/lockup-horizontal-on-dark.svg">
    <img alt="Bizzi DB" src="assets/brand/svg/lockup-horizontal-on-light.svg" height="72">
  </picture>
</p>

<p align="center">
  <strong>A fast, private PostgreSQL workspace for your desktop.</strong><br>
  Browse data, design schemas, and run SQL without a cloud account in the middle.
</p>

## Download

**[Download Bizzi DB for macOS](https://github.com/MiguelBizzi/bizzi-db/releases/latest)**

Bizzi DB ships as a universal DMG that runs on Apple silicon and Intel Macs. Open the disk image, drag Bizzi DB into Applications, and launch it. Windows and Linux are not available yet.

## Features

### Browse and edit your data

Open any table in a spreadsheet-style grid. Filter rows with expressions, choose which columns to show, follow foreign keys to related records, and insert new rows from a side drawer. Export what you see to CSV.

### Review changes before they reach your database

Edits are collected in a pending changes drawer. Look over each change, discard the ones you don't want, and apply the rest when you're ready.

### Design schemas visually

Explore your database with an interactive entity-relationship diagram. Add, edit, and delete columns from the table schema designer.

### Write and analyze SQL

Work in a multi-tab SQL editor with query history and saved statements. Inspect query plans with EXPLAIN output, and jump anywhere quickly with the command palette.

### Keep an eye on your database

View database metrics and an activity log of what you have run, so you can see what changed and when.

### Secure by default

- Passwords are stored in your operating system's keychain, never in plain text on disk.
- SSL is on by default for remote hosts. Bizzi DB warns you before you disable it for a remote server.
- Connections and queries stay on your machine. There is no account to create and no backend in the middle.

### Stay up to date

Bizzi DB checks for updates on launch and every six hours. Updates download in the background and are verified before installation. You decide when to restart and apply them.

## Getting started

1. Download and open Bizzi DB.
2. Add a connection with the host, port, database, and user for your PostgreSQL server. Turn on SSL for remote servers.
3. Pick a table from the sidebar to browse its data, or open the SQL editor to start writing queries.

## Security

For the security model, data flow, and accepted risks, read [SECURITY.md](SECURITY.md).

To report a vulnerability or a credential or data-exposure bug, please contact the maintainers privately instead of opening a public issue.

## Support

Found a bug or have an idea? [Open an issue on GitHub](https://github.com/MiguelBizzi/bizzi-db/issues).

## Development

You will need [Bun](https://bun.sh) 1.3 or later, [Rust](https://rustup.rs) 1.88 or later, and [Docker](https://www.docker.com) for the local test database.

```sh
bun install
bun run db:up   # local PostgreSQL on 127.0.0.1:5433 (user postgres, password postgres)
bun run dev     # launch the desktop app
```

Run the test suite with `bun run test`. To cut a release, follow [RELEASING.md](RELEASING.md).

## License

Bizzi DB is released under the [MIT License](LICENSE).
