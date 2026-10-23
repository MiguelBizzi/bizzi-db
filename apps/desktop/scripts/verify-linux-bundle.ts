// Run on the published Linux assets: fails when the .deb or the AppImage would not install or integrate.
// Usage: bun scripts/verify-linux-bundle.ts <file.deb> <file.AppImage> <tauri.conf.json>
// Needs dpkg-deb and GNU tar (any Debian or Ubuntu runner).
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateDebControl, validateDesktopEntry } from './linuxBundle';

const [deb, appImage, tauriConf] = process.argv.slice(2);
if (!deb || !appImage || !tauriConf) {
  console.error('usage: verify-linux-bundle.ts <file.deb> <file.AppImage> <tauri.conf.json>');
  process.exit(2);
}

const identifier: unknown = JSON.parse(readFileSync(tauriConf, 'utf8')).identifier;
if (typeof identifier !== 'string' || !identifier) {
  console.error(`::error::${tauriConf} has no identifier`);
  process.exit(2);
}

const problems: string[] = [];
const report = (source: string, found: string[]) => {
  for (const problem of found) problems.push(`${source}: ${problem}`);
};

const control = Bun.spawnSync(['dpkg-deb', '-f', deb]);
if (control.exitCode === 0) {
  report('.deb control', validateDebControl(control.stdout.toString()));
} else {
  problems.push(`.deb control: dpkg-deb -f failed: ${control.stderr.toString().trim()}`);
}

// Piped by hand so a dpkg-deb failure is not hidden behind tar's exit code.
const fsys = Bun.spawn(['dpkg-deb', '--fsys-tarfile', deb], { stdout: 'pipe', stderr: 'pipe' });
const tar = Bun.spawn(['tar', '-xO', '--wildcards', '*.desktop'], {
  stdin: fsys.stdout,
  stdout: 'pipe',
  stderr: 'pipe',
});
const [debDesktop, tarError, fsysError, fsysExit, tarExit] = await Promise.all([
  new Response(tar.stdout).text(),
  new Response(tar.stderr).text(),
  new Response(fsys.stderr).text(),
  fsys.exited,
  tar.exited,
]);
if (fsysExit !== 0) {
  problems.push(`.deb desktop entry: dpkg-deb --fsys-tarfile failed: ${fsysError.trim()}`);
} else if (tarExit !== 0 || !debDesktop.trim()) {
  problems.push(`.deb desktop entry: no .desktop file in the package ${tarError.trim()}`.trim());
} else {
  report('.deb desktop entry', validateDesktopEntry(debDesktop, identifier));
}

// --appimage-extract writes squashfs-root/ into the working directory, so it runs in a throwaway one.
// Only the AppImage runtime runs here: it unpacks the image without starting the app.
const work = mkdtempSync(join(tmpdir(), 'bizzi-appimage-'));
try {
  const image = resolve(appImage);
  chmodSync(image, 0o755);
  const extract = Bun.spawnSync([image, '--appimage-extract'], { cwd: work, stdout: 'ignore' });
  if (extract.exitCode !== 0) {
    problems.push(`AppImage: --appimage-extract failed: ${extract.stderr.toString().trim()}`);
  } else {
    const root = join(work, 'squashfs-root');
    // The AppImage spec requires exactly one .desktop file at the image root.
    const entries = readdirSync(root).filter((name) => name.endsWith('.desktop'));
    if (entries.length !== 1) {
      problems.push(`AppImage desktop entry: expected one .desktop file at the root, found ${entries.length}`);
    } else {
      try {
        report('AppImage desktop entry', validateDesktopEntry(readFileSync(join(root, entries[0]), 'utf8'), identifier));
      } catch (error) {
        problems.push(`AppImage desktop entry: cannot read ${entries[0]}: ${(error as Error).message}`);
      }
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}
console.log(`${deb} and ${appImage} are valid`);
