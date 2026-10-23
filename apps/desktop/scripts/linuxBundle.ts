const PACKAGE = 'bizzi-db';
const ARCHITECTURE = 'amd64';
const DEPENDS = ['libwebkit2gtk-4.1-0', 'libgtk-3-0'] as const;

/** Fields of a Debian control file. Lines that start with whitespace continue the previous field. */
function controlFields(control: string): Map<string, string> {
  const fields = new Map<string, string>();
  let current: string | undefined;
  for (const line of control.split('\n')) {
    if (/^\s/.test(line)) {
      if (current) fields.set(current, `${fields.get(current)} ${line.trim()}`);
      continue;
    }
    const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    current = match?.[1];
    if (match) fields.set(match[1], match[2].trim());
  }
  return fields;
}

/** Package names in a Depends value, ignoring version constraints; every alternative of `a | b` counts. */
function dependencyNames(depends: string): Set<string> {
  return new Set(
    depends
      .split(/[,|]/)
      .map((part) => part.replace(/\(.*?\)/g, '').trim())
      .filter(Boolean),
  );
}

/**
 * Checks the `dpkg-deb -f` output of the release .deb. The package name is what
 * the updater's `.deb` detection looks for in `/var/lib/dpkg/info/bizzi-db.list`,
 * and the WebKitGTK and GTK dependencies are what lets `apt` install it on a
 * clean system.
 */
export function validateDebControl(control: string): string[] {
  const fields = controlFields(control);
  const problems: string[] = [];
  const field = (name: string) => fields.get(name) || '(missing)';

  if (fields.get('Package') !== PACKAGE) {
    problems.push(`Package must be ${PACKAGE}, not ${field('Package')}`);
  }
  if (fields.get('Architecture') !== ARCHITECTURE) {
    problems.push(`Architecture must be ${ARCHITECTURE}, not ${field('Architecture')}`);
  }
  const depends = dependencyNames(fields.get('Depends') ?? '');
  for (const name of DEPENDS) {
    if (!depends.has(name)) problems.push(`Depends is missing ${name}`);
  }
  return problems;
}

/** Keys of the `[Desktop Entry]` group; other groups, comments and localized keys are skipped. */
function desktopEntryKeys(text: string): Map<string, string> {
  const keys = new Map<string, string>();
  let inEntry = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]';
      continue;
    }
    const eq = line.indexOf('=');
    if (!inEntry || eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!keys.has(key)) keys.set(key, line.slice(eq + 1).trim());
  }
  return keys;
}

/**
 * Checks a packaged `.desktop` file. StartupWMClass has to equal the bundle id,
 * because that is the GLib program name the app sets: with any other value,
 * GNOME and KDE show the running window as an unknown app with no icon.
 */
export function validateDesktopEntry(text: string, identifier: string): string[] {
  const keys = desktopEntryKeys(text);
  const problems: string[] = [];
  if (keys.get('Type') !== 'Application') problems.push('Type must be Application');
  if (!keys.get('Exec')) problems.push('Exec is missing');
  if (!keys.get('Icon')) problems.push('Icon is missing');
  if (keys.get('StartupWMClass') !== identifier) {
    problems.push(`StartupWMClass must be ${identifier}`);
  }
  return problems;
}
