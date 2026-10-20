import type { Change, ChangeKind, ChangelogEntry, UpcomingEntry } from '../src/lib/changelog';

export type ParsedChangelog = {
  upcoming: UpcomingEntry | null;
  entries: ChangelogEntry[];
};

type Section = {
  version: string;
  date: string | undefined;
  title: string;
  from: string | undefined;
  releases: number;
  summary: string;
  changes: Change[];
};

const HEADING = /^## \[(Unreleased|\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))? - (.+)$/;
const METADATA = /^<!-- (.+) -->$/;

const KIND_BY_HEADING: Record<string, ChangeKind> = { New: 'new', Better: 'better', Fixed: 'fixed' };
const HEADING_BY_KIND: Record<ChangeKind, string> = { new: 'New', better: 'Better', fixed: 'Fixed' };

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const summaryLines = new Map<Section, string[]>();
  let current: Section | null = null;
  let kind: ChangeKind | null = null;

  markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      const where = `CHANGELOG.md line ${index + 1}`;

      if (line.startsWith('## ')) {
        const match = HEADING.exec(line);
        if (!match) throw new Error(`${where}: expected "## [X.Y.Z] - YYYY-MM-DD - Title" or "## [Unreleased] - Title"`);
        const version = match[1]!;
        const date = match[2];
        const title = match[3]!;
        if (version === 'Unreleased' && date) throw new Error(`${where}: [Unreleased] takes no date`);
        if (version !== 'Unreleased' && !date) throw new Error(`${where}: version ${version} needs a date`);
        current = { version, date, title, from: undefined, releases: 1, summary: '', changes: [] };
        summaryLines.set(current, []);
        sections.push(current);
        kind = null;
        return;
      }
      if (!current || line.trim() === '') return;

      if (line.startsWith('### ')) {
        const mapped = KIND_BY_HEADING[line.slice(4).trim()];
        if (!mapped) throw new Error(`${where}: section must be New, Better or Fixed`);
        kind = mapped;
        return;
      }
      if (kind) {
        if (!line.startsWith('- ')) throw new Error(`${where}: expected a "- " bullet`);
        current.changes.push({ kind, text: line.slice(2) });
        return;
      }
      const lines = summaryLines.get(current)!;
      const metadata = lines.length === 0 ? METADATA.exec(line) : null;
      if (metadata) {
        applyMetadata(current, metadata[1]!, where);
        return;
      }
      lines.push(line.trim());
    });

  for (const section of sections) section.summary = summaryLines.get(section)!.join(' ');
  return sections;
}

function applyMetadata(section: Section, body: string, where: string): void {
  for (const part of body.split(', ')) {
    const [key, value] = part.split(': ');
    if (key === 'from' && value) section.from = value;
    else if (key === 'releases' && value && /^\d+$/.test(value)) section.releases = Number(value);
    else throw new Error(`${where}: unknown milestone field "${part}"`);
  }
}

export function parseChangelog(markdown: string): ParsedChangelog {
  const result: ParsedChangelog = { upcoming: null, entries: [] };
  for (const s of parseSections(markdown)) {
    if (s.version === 'Unreleased') {
      result.upcoming = { title: s.title, summary: s.summary, changes: s.changes };
      continue;
    }
    result.entries.push({
      version: s.version,
      ...(s.from ? { from: s.from } : {}),
      date: s.date!,
      releases: s.releases,
      title: s.title,
      summary: s.summary,
      changes: s.changes,
    });
  }
  return result;
}

function singleLine(label: string, text: string): string {
  if (/[\r\n]/.test(text)) throw new Error(`${label} must be a single line: ${JSON.stringify(text)}`);
  return text;
}

// A new heading starts whenever the kind changes, so the order of changes survives a round trip.
function renderBody(summary: string, changes: Change[]): string[] {
  const blocks: string[] = [];
  if (summary) blocks.push(singleLine('summary', summary));
  let run: string[] = [];
  let runKind: ChangeKind | null = null;
  const flush = () => {
    if (runKind) blocks.push([`### ${HEADING_BY_KIND[runKind]}`, ...run].join('\n'));
    run = [];
  };
  for (const change of changes) {
    if (change.kind !== runKind) {
      flush();
      runKind = change.kind;
    }
    run.push(`- ${singleLine('change text', change.text)}`);
  }
  flush();
  return blocks;
}

function renderSection(
  heading: string,
  summary: string,
  changes: Change[],
  metadata: string[] = [],
): string {
  const head = [singleLine('heading', heading), ...(metadata.length ? [`<!-- ${metadata.join(', ')} -->`] : [])];
  return [head.join('\n'), ...renderBody(summary, changes)].join('\n\n');
}

export function renderChangelogMarkdown(parsed: ParsedChangelog): string {
  const sections: string[] = [];
  if (parsed.upcoming) {
    const u = parsed.upcoming;
    sections.push(renderSection(`## [Unreleased] - ${u.title}`, u.summary, u.changes));
  }
  for (const e of parsed.entries) {
    const metadata = [...(e.from ? [`from: ${e.from}`] : []), ...(e.releases !== 1 ? [`releases: ${e.releases}`] : [])];
    sections.push(renderSection(`## [${e.version}] - ${e.date} - ${e.title}`, e.summary, e.changes, metadata));
  }
  return `${sections.join('\n\n')}\n`;
}

export function renderChangelogData(parsed: ParsedChangelog): string {
  return [
    '// Generated by apps/web/scripts/generate-changelog.ts from CHANGELOG.md. Do not edit by hand.',
    "import type { ChangelogEntry, UpcomingEntry } from './changelog';",
    '',
    `export const UPCOMING: UpcomingEntry | null = ${JSON.stringify(parsed.upcoming, null, 2)};`,
    '',
    `export const CHANGELOG: ChangelogEntry[] = ${JSON.stringify(parsed.entries, null, 2)};`,
    '',
  ].join('\n');
}

export function extractReleaseNotes(markdown: string, version: string): string {
  const section = parseSections(markdown).find((s) => s.version === version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`);
  if (section.changes.length === 0) throw new Error(`CHANGELOG.md section ${version} lists no changes`);
  return `${renderBody(section.summary, section.changes).join('\n\n')}\n`;
}
