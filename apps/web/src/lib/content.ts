export type Pillar = {
  title: string;
  body: string;
  footnote: string;
};

export type Feature = {
  title: string;
  body: string;
};

export const PILLARS: Pillar[] = [
  {
    title: 'Native through Tauri, not Electron',
    body: 'Bizzi DB is a Tauri 2 desktop app. The window is a system WebView. Connection pools, SQL execution, and SSH tunnels run in Rust — not a bundled Chromium process.',
    footnote: 'Rust core · Tauri 2 shell',
  },
  {
    title: 'Local-first Postgres',
    body: 'Passwords stay on your machine, in the OS keychain when you enable it. Query text never leaves the app. There is no cloud account and no telemetry.',
    footnote: 'Keychain · no remote sync',
  },
  {
    title: 'Keyboard-first workspace',
    body: 'Jump tables and queries with the command palette, run SQL with Mod-Enter, and keep edits staged until you review the generated statements.',
    footnote: '⌘K / Ctrl+K · Mod-Enter to run',
  },
];

export const FEATURES: Feature[] = [
  {
    title: 'Table grid with pending commits',
    body: 'Browse rows with search, filters, and paging. Edit cells inline, insert or delete rows, then review the SQL in the pending-changes drawer before anything hits Postgres.',
  },
  {
    title: 'SQL editor',
    body: 'CodeMirror with PostgreSQL highlighting, schema-aware autocomplete, lint in the gutter, and sql-formatter. Results export as CSV, JSON, Markdown, or SQL.',
  },
  {
    title: 'Interactive ERD',
    body: 'Foreign-key edges from the live catalog. Pan, zoom, search, drag tables, and export a PNG. Open a node straight into its data grid or schema designer.',
  },
  {
    title: 'Schema designer',
    body: 'Inspect columns and indexes, then add, edit, or drop columns by executing the generated DDL against your database.',
  },
  {
    title: 'SSH tunnels and SSL',
    body: 'Connect through a bastion with password or private-key auth. SSL modes are validated in Rust, not only in the form.',
  },
  {
    title: 'Command palette',
    body: '⌘K / Ctrl+K jumps to tables, saved queries, the ERD, metrics, pending changes, and the activity log without leaving the keyboard.',
  },
];

export const ARCHITECTURE: Feature[] = [
  {
    title: 'Rust owns the session',
    body: 'The tokio-postgres adapter, connection validation, identifier quoting, and SSH tunnel live in Rust. The UI invokes those commands; it does not talk to Postgres itself.',
  },
  {
    title: 'Tauri 2 instead of Electron',
    body: 'The desktop shell is Tauri 2. You get a native window and the OS WebView. Updates come from GitHub Releases and are signature-checked before install.',
  },
  {
    title: 'Secrets stay on the machine',
    body: 'Enable the OS keychain (macOS Keychain, Windows Credential Manager, or libsecret) or keep a local secret file. Profile metadata is SQLite in the app-data directory.',
  },
];

export const CTA = {
  title: "It's free.",
  emphasis: 'Completely free.',
  body: 'Download Bizzi DB from GitHub Releases. No account, no subscription, no catch — free forever. Rust for the session. Tauri for the window.',
};

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Which databases does Bizzi DB support?',
    a: 'PostgreSQL. The desktop app ships a single adapter. Other dialects are not available in this version.',
  },
  {
    q: 'Where are connection passwords stored?',
    a: 'On your machine. Turn on the OS keychain in Settings, or keep secrets in a local file under the app-data directory. Nothing is uploaded.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. The desktop app does not need the internet to connect to local or private Postgres. Checking for updates uses GitHub Releases when you ask it to.',
  },
  {
    q: 'Can I connect through SSH?',
    a: 'Yes. Each connection can open an SSH tunnel with a password or a private key. SSL modes are configured per profile.',
  },
  {
    q: 'How do I install it?',
    a: 'Download the installer for your OS from the latest GitHub Release: universal DMG for macOS, NSIS for Windows, AppImage for Linux.',
  },
  {
    q: 'Why Rust and Tauri?',
    a: 'Rust runs the Postgres session, SSH, and validation so connection handling stays outside the UI thread. Tauri 2 wraps that in a native window with a system WebView instead of shipping Chromium.',
  },
];
