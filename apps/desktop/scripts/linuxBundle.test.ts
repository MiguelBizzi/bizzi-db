import { describe, expect, test } from 'bun:test';
import { validateDebControl, validateDesktopEntry } from './linuxBundle';

// `dpkg-deb -f` output of the .deb that tauri 2.2 bundles for this app.
const control = `Package: bizzi-db
Version: 0.1.20
Architecture: amd64
Installed-Size: 24116
Maintainer: MiguelBizzi
Priority: optional
Depends: libwebkit2gtk-4.1-0, libgtk-3-0
Description: Desktop client for PostgreSQL
 (none)
`;

const desktop = `[Desktop Entry]
Categories=Development;
Comment=Desktop client for PostgreSQL
Exec=db-desktop
Icon=db-desktop
Name=Bizzi DB
StartupWMClass=com.bizzidb.app
Terminal=false
Type=Application
Keywords=database;postgres;postgresql;sql;
`;

const identifier = 'com.bizzidb.app';

describe('validateDebControl', () => {
  test('accepts the control file of a real Tauri .deb', () => {
    expect(validateDebControl(control)).toEqual([]);
  });

  test('names a missing WebKitGTK dependency', () => {
    expect(validateDebControl(control.replace('libwebkit2gtk-4.1-0, ', ''))).toEqual([
      'Depends is missing libwebkit2gtk-4.1-0',
    ]);
  });

  test('rejects another architecture', () => {
    const problems = validateDebControl(control.replace('amd64', 'arm64'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('arm64');
  });

  test('rejects another package name', () => {
    expect(validateDebControl(control.replace('bizzi-db', 'db-desktop'))).toEqual([
      'Package must be bizzi-db, not db-desktop',
    ]);
  });

  test('accepts version constraints, alternatives and folded lines in Depends', () => {
    const folded = control.replace(
      'Depends: libwebkit2gtk-4.1-0, libgtk-3-0',
      'Depends: libc6 (>= 2.35),\n libwebkit2gtk-4.1-0 (>= 2.40) | libwebkit2gtk-4.1-0t64,\n libgtk-3-0',
    );
    expect(validateDebControl(folded)).toEqual([]);
  });

  test('reports every missing field of an empty control file', () => {
    expect(validateDebControl('')).toEqual([
      'Package must be bizzi-db, not (missing)',
      'Architecture must be amd64, not (missing)',
      'Depends is missing libwebkit2gtk-4.1-0',
      'Depends is missing libgtk-3-0',
    ]);
  });
});

describe('validateDesktopEntry', () => {
  test('accepts the entry Tauri installs from the template', () => {
    expect(validateDesktopEntry(desktop, identifier)).toEqual([]);
  });

  test('requires StartupWMClass to be the bundle id', () => {
    expect(
      validateDesktopEntry(desktop.replace('com.bizzidb.app', 'bizzi-db'), identifier),
    ).toEqual(['StartupWMClass must be com.bizzidb.app']);
  });

  test('requires Type, Exec and Icon', () => {
    const bare = '[Desktop Entry]\nName=Bizzi DB\nType=Link\nExec=\nStartupWMClass=com.bizzidb.app\n';
    expect(validateDesktopEntry(bare, identifier)).toEqual([
      'Type must be Application',
      'Exec is missing',
      'Icon is missing',
    ]);
  });

  test('ignores keys outside the [Desktop Entry] group', () => {
    const actionOnly = `[Desktop Action new]\nType=Application\nExec=db-desktop\nIcon=db-desktop\nStartupWMClass=com.bizzidb.app\n`;
    expect(validateDesktopEntry(actionOnly, identifier)).toHaveLength(4);
  });

  test('ignores comments and localized keys', () => {
    const localized = desktop
      .replace('Icon=db-desktop\n', '# Icon=db-desktop\nIcon[de]=db-desktop\n');
    expect(validateDesktopEntry(localized, identifier)).toEqual(['Icon is missing']);
  });
});
