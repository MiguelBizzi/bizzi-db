import { Fragment, useState } from 'react';
import { ArrowUpRight, ChevronDown, Sparkles } from 'lucide-react';
import {
  CHANGELOG,
  FIRST_RELEASE_DATE,
  UPCOMING,
  compareVersions,
  type Change,
  type ChangeKind,
  type ChangelogEntry,
  type UpcomingEntry,
} from '../../lib/changelog';
import { ALL_RELEASES_URL, REPO_URL } from '../../lib/site';
import { useLatestRelease } from '../../lib/useLatestRelease';

const VISIBLE_AT_FIRST = 3;

const KINDS: Record<
  ChangeKind,
  { sigil: string; label: string; tone: string; chip: string }
> = {
  new: {
    sigil: '+',
    label: 'new',
    tone: 'text-primary',
    chip: 'bg-primary/10 border-primary/25',
  },
  better: {
    sigil: '~',
    label: 'better',
    tone: 'text-secondary',
    chip: 'bg-secondary/10 border-secondary/25',
  },
  fixed: {
    sigil: '✓',
    label: 'fixed',
    tone: 'text-emerald-500 dark:text-emerald-400',
    chip: 'bg-emerald-500/10 border-emerald-500/25',
  },
};

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Renders `code` spans inside a change line. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="font-mono text-[0.92em] px-1.5 py-0.5 rounded bg-muted text-foreground"
          >
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function ChangeLine({ change }: { change: Change }) {
  const kind = KINDS[change.kind];
  return (
    <li className="flex gap-3 items-baseline">
      <span
        className={`shrink-0 w-4 text-center font-mono text-sm font-bold ${kind.tone}`}
        aria-hidden
      >
        {kind.sigil}
      </span>
      <span className="sr-only">{kind.label}: </span>
      <span className="text-sm text-muted-foreground leading-relaxed">
        <Inline text={change.text} />
      </span>
    </li>
  );
}

function KindCounts({ changes }: { changes: Change[] }) {
  const counts = (Object.keys(KINDS) as ChangeKind[])
    .map((kind) => ({
      kind,
      n: changes.filter((c) => c.kind === kind).length,
    }))
    .filter((c) => c.n > 0);
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map(({ kind, n }) => (
        <span
          key={kind}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] ${KINDS[kind].chip} ${KINDS[kind].tone}`}
        >
          {KINDS[kind].sigil} {n} {KINDS[kind].label}
        </span>
      ))}
    </div>
  );
}

function Node({ latest }: { latest: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-7 flex h-[23px] w-[23px] items-center justify-center rounded-full border bg-background ${
        latest ? 'border-primary' : 'border-border'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          latest ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50'
        }`}
      />
    </span>
  );
}

function Card({
  entry,
  latest,
}: {
  entry: ChangelogEntry;
  latest: boolean;
}) {
  const versionLabel = entry.from
    ? `v${entry.from} → v${entry.version}`
    : `v${entry.version}`;

  return (
    <li className="relative pl-12 pb-8 last:pb-0">
      <Node latest={latest} />
      <article
        className={`group rounded-2xl border bg-card p-5 sm:p-7 transition-colors ${
          latest
            ? 'border-primary/40 shadow-lg shadow-primary/10'
            : 'border-border hover:border-primary/30'
        }`}
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`font-mono text-sm font-bold px-2.5 py-1 rounded-lg border ${
              latest
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-foreground border-border'
            }`}
          >
            {versionLabel}
          </span>
          {latest && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono font-bold text-primary">
              <Sparkles className="w-3 h-3" />
              Latest
            </span>
          )}
          <time
            dateTime={entry.date}
            className="font-mono text-xs text-muted-foreground sm:ml-auto"
          >
            {formatDate(entry.date)}
          </time>
        </header>

        <h3 className="mt-4 text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug">
          {entry.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {entry.summary}
        </p>

        <ul className="mt-5 space-y-2.5 border-t border-border/70 pt-5">
          {entry.changes.map((change) => (
            <ChangeLine key={change.text} change={change} />
          ))}
        </ul>

        <div className="mt-5">
          <KindCounts changes={entry.changes} />
        </div>
      </article>
    </li>
  );
}

function PendingCard({ version }: { version: string }) {
  return (
    <li className="relative pl-12 pb-8">
      <Node latest />
      <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5 sm:p-6 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground">
          v{version}
        </span>
        <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-primary">
          Latest
        </span>
        <span className="text-sm text-muted-foreground">
          Just shipped. The notes for this one are on their way.
        </span>
        <a
          href={`${REPO_URL}/releases/tag/v${version}`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
        >
          See the release
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </li>
  );
}

function UpcomingCard({ entry }: { entry: UpcomingEntry }) {
  return (
    <li className="relative pl-12 pb-8">
      <span
        aria-hidden
        className="absolute left-0 top-7 flex h-[23px] w-[23px] items-center justify-center rounded-full border border-dashed border-primary/60 bg-background"
      >
        <span className="h-2 w-2 rounded-full border border-primary/70" />
      </span>
      <article className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5 sm:p-7">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg border border-dashed border-primary/60 text-primary">
            Next release
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            Merged, not shipped yet
          </span>
        </header>
        <h3 className="mt-4 text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug">
          {entry.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {entry.summary}
        </p>
        <ul className="mt-5 space-y-2.5 border-t border-primary/20 pt-5">
          {entry.changes.map((change) => (
            <ChangeLine key={change.text} change={change} />
          ))}
        </ul>
      </article>
    </li>
  );
}

export function Changelog() {
  const release = useLatestRelease();
  const [showAll, setShowAll] = useState(false);

  const newest = CHANGELOG[0];
  const unwritten = release.live && compareVersions(release.version, newest.version) > 0;
  // With an unwritten release on top, the newest written entry is no longer "latest".
  const latestVersion = unwritten ? release.version : newest.version;

  const visible = showAll ? CHANGELOG : CHANGELOG.slice(0, VISIBLE_AT_FIRST);
  const hidden = CHANGELOG.length - visible.length;

  return (
    <section
      id="changelog"
      className="py-24 border-t border-border scroll-mt-20 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[600px] h-[400px] bg-gradient-to-bl from-primary/10 to-transparent blur-3xl -z-10 pointer-events-none"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          <div className="lg:col-span-4 lg:sticky lg:top-24 self-start space-y-8">
            <div>
              <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
                Changelog
              </span>
              <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-[1.08]">
                Better with every release
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                Bizzi DB ships often. Here is what changed, in plain words,
                from the first build to today.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card divide-y divide-border/70">
              <div className="px-5 py-4 sm:px-7 sm:py-5 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
                    Current version
                  </div>
                  <div className="font-mono text-lg font-bold text-foreground">
                    v{release.version}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs font-mono text-muted-foreground">
              Since {formatDate(FIRST_RELEASE_DATE)} ·{' '}
              <a
                href={ALL_RELEASES_URL}
                className="text-primary hover:opacity-80 transition-opacity"
              >
                every release on GitHub
              </a>
            </p>
          </div>

          <div className="lg:col-span-8">
            <ol className="relative">
              <div
                aria-hidden
                className="absolute left-[11px] top-8 bottom-4 w-px bg-gradient-to-b from-primary/70 via-border to-border/0"
              />
              {unwritten && <PendingCard version={release.version} />}
              {/* "Next release" card is hidden for now. Re-enable by restoring:
              {!unwritten && UPCOMING && <UpcomingCard entry={UPCOMING} />}
              */}
              {visible.map((entry) => (
                <Card
                  key={entry.version}
                  entry={entry}
                  latest={entry.version === latestVersion}
                />
              ))}
            </ol>

            {hidden > 0 && (
              <div className="pl-12 mt-8">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  Show earlier releases
                  <span className="font-mono text-muted-foreground">
                    {hidden} more
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
