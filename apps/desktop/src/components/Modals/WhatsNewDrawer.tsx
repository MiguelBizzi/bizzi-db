import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import {
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Drawer, DrawerPanel } from "../ui/Drawer";
import { OverlayPresence } from "../ui/OverlayPresence";
import { BrandMark } from "../icons/BrandMark";
import type { ChangeKind, ChangelogEntry } from "../../lib/changelog";
import { countChanges, followScroll, splitInlineCode } from "../../lib/whatsNew";
import { DURATION, enterTransition, sheetUp } from "../../lib/motion";
import { useMotionPreference } from "../../lib/motionPreference";

interface WhatsNewDrawerProps {
  isOpen: boolean;
  /** Newest first. */
  entries: ChangelogEntry[];
  /** The version the user updated from; null when opened by hand. */
  since: string | null;
  onClose: () => void;
  onOpenReleaseNotes: () => void;
}

const ANIMATED_RELEASES = 3;

const KIND_ORDER: ChangeKind[] = ["new", "better", "fixed"];

const KIND_STYLE: Record<
  ChangeKind,
  { label: string; icon: LucideIcon; text: string; tile: string; dot: string; chip: string }
> = {
  new: {
    label: "New",
    icon: Sparkles,
    text: "text-emerald-400",
    tile: "bg-emerald-500/10 border-emerald-500/25",
    dot: "bg-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  better: {
    label: "Better",
    icon: TrendingUp,
    text: "text-sky-400",
    tile: "bg-sky-500/10 border-sky-500/25",
    dot: "bg-sky-400",
    chip: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  },
  fixed: {
    label: "Fixed",
    icon: Wrench,
    text: "text-amber-400",
    tile: "bg-amber-500/10 border-amber-500/25",
    dot: "bg-amber-400",
    chip: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
};

// The hero plays in after the sheet has mostly risen, one element after another.
const heroStagger: Variants = {
  initial: {},
  animate: { transition: { delayChildren: DURATION.slow * 0.7, staggerChildren: 0.06 } },
};

const rise: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: enterTransition(DURATION.slow) },
};

const logoIn: Variants = {
  initial: { opacity: 0, scale: 0.6, rotate: -12 },
  animate: { opacity: 1, scale: 1, rotate: 0, transition: enterTransition(DURATION.slow) },
};

const glowIn: Variants = {
  initial: { opacity: 0, scale: 0.4 },
  animate: { opacity: 1, scale: 1, transition: enterTransition(DURATION.slow * 2) },
};

const chipIn: Variants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: enterTransition(DURATION.base) },
};

const HERO_BACKDROP: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(ellipse 60% 90% at 12% 0%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)",
    "radial-gradient(ellipse 50% 80% at 95% 10%, color-mix(in oklch, var(--secondary) 18%, transparent), transparent 70%)",
  ].join(", "),
};

const HERO_GRID: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
  maskImage: "linear-gradient(to bottom, black, transparent 85%)",
  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function versionLabel(entry: ChangelogEntry): string {
  return entry.from ? `v${entry.from} – ${entry.version}` : `v${entry.version}`;
}

const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {splitInlineCode(text).map((segment, i) =>
      segment.code ? (
        <code
          key={i}
          className="px-1 py-px rounded-md bg-muted border border-border font-mono text-[11px] text-foreground"
        >
          {segment.text}
        </code>
      ) : (
        <React.Fragment key={i}>{segment.text}</React.Fragment>
      ),
    )}
  </>
);

interface ReleaseProps {
  entry: ChangelogEntry;
  installed: boolean;
  last: boolean;
  /** Only the first releases animate in; the rest are already in place when scrolled to. */
  animate: boolean;
  sectionRef: (node: HTMLElement | null) => void;
}

const Release: React.FC<ReleaseProps> = ({ entry, installed, last, animate, sectionRef }) => (
  <motion.article
    ref={sectionRef}
    variants={animate ? rise : undefined}
    className="relative pl-12 pb-12"
  >
    {!last && (
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-9 bottom-0 w-px bg-gradient-to-b from-border via-border to-transparent"
      />
    )}
    <span
      aria-hidden="true"
      className={`absolute left-0 top-0.5 w-8 h-8 rounded-full border grid place-items-center ${
        installed ? "border-primary/40 bg-primary/10" : "border-border bg-popover"
      }`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          installed ? "bg-primary shadow-[0_0_12px_var(--primary)]" : "bg-muted-foreground/40"
        }`}
      />
    </span>

    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-mono text-lg font-bold tracking-tight text-foreground">
        {versionLabel(entry)}
      </span>
      {installed && (
        <span className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-mono text-[10px] font-semibold uppercase tracking-wider">
          Installed
        </span>
      )}
      <time dateTime={entry.date} className="ml-auto font-mono text-[11px] text-muted-foreground">
        {formatDate(entry.date)}
      </time>
    </header>

    <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{entry.title}</h3>
    {entry.summary && (
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground max-w-prose">
        <RichText text={entry.summary} />
      </p>
    )}

    <div className="mt-5 space-y-3">
      {KIND_ORDER.map((kind) => {
        const changes = entry.changes.filter((c) => c.kind === kind);
        if (changes.length === 0) return null;
        const style = KIND_STYLE[kind];
        const Icon = style.icon;
        return (
          <section
            key={kind}
            className="rounded-2xl border border-border bg-background/50 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-6 h-6 rounded-lg border grid place-items-center ${style.tile}`}>
                <Icon className={`w-3.5 h-3.5 ${style.text}`} aria-hidden="true" />
              </span>
              <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${style.text}`}>
                {style.label}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{changes.length}</span>
            </div>
            <ul className="space-y-2.5">
              {changes.map((change, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-foreground/90">
                  <span
                    aria-hidden="true"
                    className={`mt-[0.6em] w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`}
                  />
                  <span className="select-text">
                    <RichText text={change.text} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  </motion.article>
);

const WhatsNewDrawerBody: React.FC<WhatsNewDrawerProps> = ({
  entries,
  since,
  onClose,
  onOpenReleaseNotes,
}) => {
  const titleId = useId();
  const counts = useMemo(() => countChanges(entries), [entries]);
  const { reduced } = useMotionPreference();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const button = navRef.current?.querySelectorAll("button")[active];
    button?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);
  const newest = entries[0];
  const showNav = entries.length > 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const jump = useRef<{ target: number | null; top: number }>({ target: null, top: 0 });
  const jumpTimer = useRef<number | undefined>(undefined);

  const endJump = useCallback(() => {
    jump.current.target = null;
    window.clearTimeout(jumpTimer.current);
  }, []);

  useEffect(() => endJump, [endJump]);

  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const tops = sections.current.map((node) => node?.offsetTop ?? 0);
    const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
    const next = followScroll(
      { active: 0, target: jump.current.target },
      tops,
      root.scrollTop,
      { targetTop: jump.current.top, atBottom },
    );
    if (next.target === null) endJump();
    setActive(next.active);
  }, [endJump]);

  const jumpTo = (index: number) => {
    const root = scrollRef.current;
    const node = sections.current[index];
    if (!root || !node) return;
    const top = Math.max(0, Math.min(node.offsetTop - 24, root.scrollHeight - root.clientHeight));
    setActive(index);
    if (Math.abs(root.scrollTop - top) <= 2) return;
    jump.current = { target: index, top };
    window.clearTimeout(jumpTimer.current);
    // WebKit may stop a smooth scroll short of its target without any further event.
    jumpTimer.current = window.setTimeout(endJump, 1200);
    root.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  if (!newest) return null;

  const releaseCount = entries.reduce((sum, e) => sum + e.releases, 0);
  const subtitle = since
    ? releaseCount > 1
      ? `Everything since v${since}, across ${releaseCount} releases.`
      : `You're up to date from v${since}.`
    : showNav
      ? `Every release so far, ${releaseCount} in all.`
      : newest.title;

  return (
    <Drawer onScrimClick={onClose}>
      <DrawerPanel
        variants={sheetUp}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-5xl h-[min(88vh,860px)] flex flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-border bg-popover text-popover-foreground shadow-[0_-24px_80px_-20px_rgba(0,0,0,0.5)] font-sans select-none"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-border">
          <div aria-hidden="true" className="absolute inset-0" style={HERO_BACKDROP} />
          <div aria-hidden="true" className="absolute inset-0 opacity-40" style={HERO_GRID} />

          <div className="relative flex justify-center pt-3">
            <span aria-hidden="true" className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 p-2 rounded-full bg-background/60 border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close what's new"
          >
            <X className="w-4 h-4" />
          </button>

          <motion.div
            variants={heroStagger}
            className="relative px-8 pt-6 pb-7 flex items-center gap-6"
          >
            <motion.div variants={logoIn} className="relative shrink-0">
              <motion.span
                variants={glowIn}
                aria-hidden="true"
                className="absolute -inset-4 rounded-[28px] bg-primary/25 blur-2xl"
              />
              <span className="relative grid place-items-center w-[72px] h-[72px] rounded-[22px] border border-border bg-background/80 shadow-lg backdrop-blur">
                <BrandMark size="md" className="!h-9" />
              </span>
            </motion.div>

            <div className="min-w-0 space-y-2">
              <motion.div
                variants={rise}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                What's new
              </motion.div>
              <motion.h2
                variants={rise}
                id={titleId}
                className="text-3xl font-semibold tracking-tight text-foreground"
              >
                Bizzi DB <span className="text-primary">{newest.version}</span>
              </motion.h2>
              <motion.p variants={rise} className="text-sm text-muted-foreground">
                {subtitle}
              </motion.p>
              <motion.div variants={heroStagger} className="flex flex-wrap gap-1.5 pt-1">
                {KIND_ORDER.filter((kind) => counts[kind] > 0).map((kind) => (
                  <motion.span
                    key={kind}
                    variants={chipIn}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border font-mono text-[11px] ${KIND_STYLE[kind].chip}`}
                  >
                    <span className="font-semibold">{counts[kind]}</span>
                    {KIND_STYLE[kind].label.toLowerCase()}
                  </motion.span>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </header>

        <div className="flex-1 min-h-0 flex">
          {showNav && (
            <motion.nav
              layoutScroll
              ref={navRef}
              aria-label="Releases"
              className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-background/30 overflow-y-auto py-4 px-3"
            >
              <div className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Releases
              </div>
              {entries.map((entry, index) => (
                <button
                  key={entry.version}
                  type="button"
                  onClick={() => jumpTo(index)}
                  aria-current={index === active ? "true" : undefined}
                  className="relative w-full text-left px-3 py-2 rounded-xl"
                >
                  {index === active && (
                    <motion.span
                      layoutId="whats-new-active-release"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl bg-accent border border-border"
                      transition={enterTransition(DURATION.slow)}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <span
                      className={`font-mono text-[13px] font-semibold ${
                        index === active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {versionLabel(entry)}
                    </span>
                    {index === 0 && (
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="relative block truncate text-[11px] text-muted-foreground">
                    {entry.title}
                  </span>
                </button>
              ))}
            </motion.nav>
          )}

          <div
            ref={scrollRef}
            onScroll={showNav ? onScroll : undefined}
            // Taking over the scroll mid-jump hands the highlight back to the reading position.
            onWheel={showNav ? endJump : undefined}
            onPointerDown={showNav ? endJump : undefined}
            className="relative flex-1 min-w-0 overflow-y-auto px-8 pt-8"
          >
            <motion.div variants={heroStagger} className="max-w-2xl">
              {entries.map((entry, index) => (
                <Release
                  key={entry.version}
                  entry={entry}
                  installed={index === 0}
                  last={index === entries.length - 1}
                  animate={index < ANIMATED_RELEASES}
                  sectionRef={(node) => {
                    sections.current[index] = node;
                  }}
                />
              ))}
            </motion.div>
          </div>
        </div>

        <footer className="shrink-0 px-8 py-4 border-t border-border bg-background/60 backdrop-blur flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenReleaseNotes}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            All release notes on GitHub
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="px-5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-[0_8px_24px_-8px_var(--primary)] hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </footer>
      </DrawerPanel>
    </Drawer>
  );
};

export const WhatsNewDrawer: React.FC<WhatsNewDrawerProps> = (props) => (
  <OverlayPresence isOpen={props.isOpen && props.entries.length > 0}>
    <WhatsNewDrawerBody {...props} />
  </OverlayPresence>
);
