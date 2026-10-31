export type Pillar = {
  title: string;
  body: string;
  footnote: string;
};

export type Feature = {
  title: string;
  body: string;
};

export type Database = {
  id: 'postgres' | 'mysql';
  name: string;
  body: string;
  highlights: string[];
};

export const DATABASES: Database[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    body: 'A native tokio-postgres adapter. Browse schemas, edit rows, and run SQL against local or remote servers.',
    highlights: [
      'Schemas, tables, views, and routines',
      'Schema-aware SQL autocomplete',
      'Interactive ERD from the live catalog',
    ],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    body: 'A native mysql_async adapter with the same workspace. Point it at a MySQL server and the grid, editor, and designer follow.',
    highlights: [
      'Databases, tables, views, and routines',
      'MySQL dialect for generated DDL',
      'Interactive ERD from foreign keys',
    ],
  },
];

export const SHARED_CAPABILITIES: string[] = [
  'Table grid with pending commits',
  'SQL editor with export',
  'Schema designer',
  'SSH tunnels',
  'SSL modes',
  'OS keychain',
];

export const PILLARS: Pillar[] = [
  {
    title: 'Native through Tauri, not Electron',
    body: 'Bizzi DB is a Tauri 2 desktop app. The window is a system WebView. Connection pools, SQL execution, and SSH tunnels run in Rust — not a bundled Chromium process.',
    footnote: 'Rust core · Tauri 2 shell',
  },
  {
    title: 'Local-first, any database',
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
    body: 'Browse rows with search, filters, and paging. Edit cells inline, insert or delete rows, then review the SQL in the pending-changes drawer before anything hits your database.',
  },
  {
    title: 'SQL editor',
    body: 'CodeMirror with PostgreSQL and MySQL highlighting, schema-aware autocomplete, lint in the gutter, and sql-formatter. Results export as CSV, JSON, Markdown, or SQL.',
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
    body: 'The tokio-postgres and mysql_async adapters, connection validation, identifier quoting, and SSH tunnel live in Rust. The UI invokes those commands; it does not talk to your database itself.',
  },
  {
    title: 'Tauri 2 instead of Electron',
    body: 'The desktop shell is Tauri 2. You get a native window and the OS WebView. Updates come from GitHub Releases and are signature-checked before install.',
  },
  {
    title: 'Secrets stay on the machine',
    body: 'Enable the OS keychain (macOS Keychain, Windows Credential Manager, or the Linux Secret Service keyring) or keep a local secret file. Profile metadata is SQLite in the app-data directory.',
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
    a: 'PostgreSQL and MySQL. Each has its own native Rust adapter, and both share the same grid, SQL editor, ERD, and schema designer. Pick the engine when you add a connection.',
  },
  {
    q: 'Where are connection passwords stored?',
    a: 'On your machine. Turn on the OS keychain in Settings, or keep secrets in a local file under the app-data directory. Nothing is uploaded.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. The desktop app does not need the internet to connect to local or private PostgreSQL and MySQL servers. Checking for updates uses GitHub Releases when you ask it to.',
  },
  {
    q: 'Can I connect through SSH?',
    a: 'Yes. Each connection can open an SSH tunnel with a password or a private key. SSL modes are configured per profile.',
  },
  {
    q: 'How do I install it?',
    a: 'Download the universal macOS DMG, the Windows x64 installer, or the Linux x86_64 .deb or AppImage from the latest GitHub Release. On Windows the installer is not code-signed yet, so the first time SmartScreen says "Windows protected your PC": choose More info, then Run anyway. Updates after that install from inside the app and are verified before they run.',
  },
  {
    q: 'Why Rust and Tauri?',
    a: 'Rust runs the database session, SSH, and validation so connection handling stays outside the UI thread. Tauri 2 wraps that in a native window with a system WebView instead of shipping Chromium.',
  },
];
