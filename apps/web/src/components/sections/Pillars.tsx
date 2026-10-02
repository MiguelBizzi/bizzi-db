import { PILLARS } from '../../lib/content';

export function Pillars() {
  return (
    <section id="pillars" className="py-24 border-t border-border scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mb-16">
          <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
            Core design
          </span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-[1.1]">
            Built as a native Postgres tool
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Rust for the session. Tauri for the window. The UI stays out of the
            way of your data.
          </p>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-0">
          {PILLARS.map((pillar, index) => (
            <li
              key={pillar.title}
              className="md:px-8 first:md:pl-0 last:md:pr-0 md:border-l md:first:border-l-0 border-border/70"
            >
              <span className="block font-mono text-xs tracking-[0.2em] text-primary/80 mb-5">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug">
                {pillar.title}
              </h3>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                {pillar.body}
              </p>
              <p className="mt-6 text-[11px] font-mono text-muted-foreground/80">
                {pillar.footnote}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
