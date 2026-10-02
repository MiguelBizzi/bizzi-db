import { ARCHITECTURE } from '../../lib/content';

const LAYERS = [
  { kicker: 'Window', item: ARCHITECTURE[1] },
  { kicker: 'Session', item: ARCHITECTURE[0] },
  { kicker: 'Machine', item: ARCHITECTURE[2] },
];

export function Architecture() {
  return (
    <section id="architecture" className="py-24 border-t border-border scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
          <div className="lg:col-span-5">
            <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
              Architecture
            </span>
            <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-[1.08]">
              Why Rust and Tauri
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-md">
              The desktop client is a thin UI over a Rust session. Tauri 2 hosts
              that UI in a native window instead of shipping Chromium.
            </p>
          </div>

          <div className="lg:col-span-7">
            <ol className="relative">
              <div
                aria-hidden
                className="absolute left-[11px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/70 via-border to-border"
              />
              {LAYERS.map((layer, index) => (
                <li key={layer.item.title} className="relative pl-10 pb-10 last:pb-0">
                  <span className="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-background text-[10px] font-mono text-primary">
                    {index + 1}
                  </span>
                  <p className="text-[11px] uppercase tracking-[0.18em] font-mono text-primary">
                    {layer.kicker}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-foreground tracking-tight">
                    {layer.item.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xl">
                    {layer.item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
